// main.js — session flow and screens.
//
// There are two modes. In the laughing crowd, the first 12 characters each
// bring their own voice; after that, silent characters keep joining (faster
// and faster) until the screen is full. In "Try not to laugh" (contagion.js)
// 12 serious characters crack up one by one. Either way laughter goes on
// until the user presses Stop, or the tab has been hidden for a while.
//
// Everything is scheduled on the audio clock. The visuals never keep their own
// timeline: every frame they are derived from the time the listener is
// hearing, so they stay in sync even after the tab was in the background
// (where timers and animation frames are throttled).

import {
  createAudioContext,
  createMixer,
  heardTime,
  levelAt,
  loadVoices,
  positionAt,
  scheduleVoice,
} from './audio.js';
import { planScene, STARTING_POSE } from './contagion.js';
import { computeEnvelope, createIntensityTracker, envelopeAt } from './envelope.js';
import { createFace } from './faces.js';
import { cellCenters, layoutCells, maxItems } from './layout.js';

// ---- Session timing (seconds) ----
const JOIN_INTERVAL = 6; // between the voiced characters (the first 12)
const CROWD_INTERVAL_MIN = 2.5; // silent extras join faster and faster, down to this...
const CROWD_ACCELERATION = 8; // ...getting most of the way there after this many extras
const FADE_OUT = 6; // fade-out after Stop
const VOICE_FADE_IN = 1; // a new voice ramps up from silence over this
const START_DELAY = 0.1; // scheduling headroom after pressing Start
const BURST_LEVEL = 0.6; // "Try not to laugh": a voice starts where its envelope rises past this
const HIDDEN_STOP_AFTER = 180; // a session in a hidden tab fades out after this

// ---- Crowd ----
const MAX_FACES = 120;
const MIN_CELL_SIZE = 72; // px; nobody else joins once cells would get smaller
const INTERLEAVE_ABOVE = 40; // larger crowds update each face every other frame

// ---- Mix ----
const MASTER_LEVEL = 1; // overall volume before the compressor
const VOICE_SCALE_EXPONENT = 0.5; // with n voices each is scaled by n^-k

// ---- Envelope → motion ----
const ENVELOPE_WINDOW = 0.02; // RMS window (s)
const GATE_OPEN = 0.18; // envelope level that starts a laugh...
const GATE_CLOSE = 0.12; // ...and the lower level that ends it
const ATTACK = 0.03; // intensity rise time (s)
const RELEASE = 0.12; // intensity fall time (s)

const FILES = ['man', 'woman', 'child'].flatMap((type) =>
  [0, 1, 2, 3].map((n) => ({ type, url: `audio/laugh_${type}_${n}.mp3` })),
);

const stage = document.getElementById('stage');
const title = document.querySelector('h1');
const startScreen = document.getElementById('screen-start');
const endScreen = document.getElementById('screen-end');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const stopButton = document.getElementById('btn-stop');
const hint = document.getElementById('hint');
const loadError = document.getElementById('load-error');

const ctx = createAudioContext();
const mixer = createMixer(ctx, MASTER_LEVEL);

let voices = null;
let session = null;
let faceCap = MAX_FACES;
let wakeLock = null;
let lastFrameMs = 0;

setBouncyText(title, title.textContent);
for (const button of modeButtons) setBouncyText(button, button.textContent);

// Start loading right away; the mode buttons wait until everything is ready.
loadVoices(ctx, FILES, (done, total) => {
  hint.textContent = `Loading… ${done}/${total}`;
})
  .then((loaded) => {
    voices = loaded.map((voice) => ({
      ...voice,
      envelope: computeEnvelope(voice.buffer, ENVELOPE_WINDOW),
    }));
    hint.textContent = 'Set a comfortable volume.';
    for (const button of modeButtons) button.disabled = false;
  })
  .catch((error) => {
    console.error(error);
    hint.hidden = true;
    loadError.textContent =
      location.protocol === 'file:'
        ? "Couldn't load the recordings. Open the app through a web server, not as a local file."
        : "Couldn't load the recordings. Check your connection and reload the page.";
    loadError.hidden = false;
  });

for (const button of modeButtons) button.addEventListener('click', () => begin(button.dataset.mode));
stopButton.addEventListener('click', stop);
window.addEventListener('resize', relayout);
document.addEventListener('visibilitychange', onVisibilityChange);

async function begin(mode) {
  if (!voices || session) return;
  for (const button of modeButtons) button.disabled = true;
  // resume() has to be called directly from the click (autoplay rules, iOS).
  await ctx.resume();
  for (const button of modeButtons) button.disabled = false;
  startSession(mode);
}

function startSession(mode) {
  const now = ctx.currentTime;
  const start = now + START_DELAY;
  stage.replaceChildren();
  updateFaceCap();

  const { members, joinTimes, scene = null } = mode === 'contagion' ? startScene(start) : startCrowd(start);

  // Keep the total level steady as voices join: ramp the shared bus from
  // the scale for i voices to the scale for i + 1 while the new one fades in.
  const bus = mixer.bus.gain;
  bus.cancelScheduledValues(0);
  bus.setValueAtTime(1, now);
  [...members].sort((a, b) => a.when - b.when).forEach((member, i) => {
    if (i === 0) return;
    bus.setValueAtTime(voiceScale(i), member.when);
    bus.linearRampToValueAtTime(voiceScale(i + 1), member.levels[1].t);
  });

  const master = mixer.master.gain;
  master.cancelScheduledValues(0);
  master.setValueAtTime(MASTER_LEVEL, now);

  session = {
    mode,
    members,
    joinTimes,
    scene,
    positions: [],
    shownCount: 0,
    frameCount: 0,
    stopAt: Infinity, // nobody joins after this
    fadeStart: Infinity,
    end: Infinity,
    hiddenTimer: null,
  };

  startScreen.hidden = true;
  endScreen.hidden = true;
  stopButton.hidden = false;
  requestWakeLock();
  lastFrameMs = performance.now();
  requestAnimationFrame(frame);
}

/**
 * The laughing crowd: the voiced characters, scheduled up front. Silent
 * extras are created later, when they join (see memberAt).
 */
function startCrowd(start) {
  const joinTimes = computeJoinTimes(start, voices.length);
  const members = shuffledOrder(voices).map((voice, i) => {
    const when = joinTimes[i];
    const levels = [{ t: when, v: 0 }, { t: when + VOICE_FADE_IN, v: 1 }];
    const player = scheduleVoice(ctx, mixer.bus, voice, when, randomOffset(voice), levels);
    return createMember({ ...player, levels });
  });
  return { members, joinTimes };
}

/**
 * "Try not to laugh": all 12 characters are there from the start, each
 * voice starts when its character cracks up (see contagion.js).
 */
function startScene(start) {
  const cast = shuffled(voices);
  const scene = planScene({
    types: cast.map((voice) => voice.type),
    positions: cellCenters(cast.length, stage),
    start,
  });
  const members = cast.map((voice, i) => {
    const levels = scene.levels(i);
    const player = scheduleVoice(ctx, mixer.bus, voice, scene.crackAt[i], burstOffset(voice), levels);
    return createMember({ ...player, levels }, STARTING_POSE);
  });
  return { members, joinTimes: cast.map(() => start), scene };
}

/**
 * Join times for all MAX_FACES characters: the voiced ones JOIN_INTERVAL
 * apart, then the silent extras at intervals shrinking towards
 * CROWD_INTERVAL_MIN.
 */
function computeJoinTimes(first, voicedCount) {
  const times = [];
  let t = first;
  for (let i = 0; i < MAX_FACES; i++) {
    times.push(t);
    const extra = i + 1 - voicedCount;
    t += extra < 0
      ? JOIN_INTERVAL
      : CROWD_INTERVAL_MIN + (JOIN_INTERVAL - CROWD_INTERVAL_MIN) * Math.exp(-extra / CROWD_ACCELERATION);
  }
  return times;
}

/**
 * A character in the session: something to follow (voice, timing and
 * volume, see scheduleVoice) and a face, starting in `pose`.
 */
function createMember({ voice, when, offset, levels, source = null }, pose) {
  return {
    voice,
    when,
    offset,
    levels,
    source,
    face: createFace(voice.type, pose),
    tracker: createIntensityTracker({
      gateOpen: GATE_OPEN,
      gateClose: GATE_CLOSE,
      attack: ATTACK,
      release: RELEASE,
    }),
  };
}

/**
 * The i-th character. Silent extras borrow the envelope of a random
 * recording (starting at a random point), so they laugh in a believable
 * rhythm; their face type matches that recording.
 */
function memberAt(i) {
  if (!session.members[i]) {
    const voice = voices[Math.floor(Math.random() * voices.length)];
    const when = session.joinTimes[i];
    const levels = [{ t: when, v: 0 }, { t: when + VOICE_FADE_IN, v: 1 }];
    session.members[i] = createMember({ voice, when, offset: randomOffset(voice), levels });
  }
  return session.members[i];
}

/**
 * Fades everything out from context time `at`. Only the master gain is
 * automated, so a fade scheduled for a hidden tab can still be cancelled;
 * the sources are stopped in finishSession().
 */
function scheduleFadeOut(at) {
  const master = mixer.master.gain;
  master.cancelScheduledValues(at);
  master.setValueAtTime(MASTER_LEVEL, at);
  master.exponentialRampToValueAtTime(MASTER_LEVEL * 0.001, at + FADE_OUT);
  master.setValueAtTime(0, at + FADE_OUT);
  session.fadeStart = at;
  session.end = at + FADE_OUT;
}

function cancelFadeOut() {
  const now = ctx.currentTime;
  const master = mixer.master.gain;
  master.cancelScheduledValues(now);
  master.setValueAtTime(MASTER_LEVEL, now);
  session.fadeStart = Infinity;
  session.end = Infinity;
}

/** Stop button: fade out now; nobody joins any more. */
function stop() {
  if (!session) return;
  const now = ctx.currentTime;
  const at = now + 0.05;
  if (at >= session.fadeStart) return;

  session.stopAt = at;
  clearTimeout(session.hiddenTimer);
  session.hiddenTimer = null;

  // Voices that haven't joined yet never will.
  for (const member of session.members) {
    if (member.source && member.when > at) member.source.stop(at);
  }

  // Freeze the voice-count scaling where it is.
  const bus = mixer.bus.gain;
  const level = bus.value;
  bus.cancelScheduledValues(now);
  bus.setValueAtTime(level, now);

  scheduleFadeOut(at);
}

/**
 * Hidden tab: schedule a fade-out HIDDEN_STOP_AFTER from now (on the audio
 * clock, which isn't throttled). Coming back in time cancels it.
 */
function onVisibilityChange() {
  if (!session) return;

  if (document.hidden) {
    const at = ctx.currentTime + HIDDEN_STOP_AFTER;
    if (at >= session.fadeStart) return;
    scheduleFadeOut(at);
    // Timers are throttled in hidden tabs, but the audio is silent by then
    // anyway; this just releases the sources and the audio hardware.
    session.hiddenTimer = setTimeout(finishSession, (HIDDEN_STOP_AFTER + FADE_OUT) * 1000);
    return;
  }

  requestWakeLock();
  if (session.hiddenTimer && ctx.currentTime < session.fadeStart) {
    clearTimeout(session.hiddenTimer);
    session.hiddenTimer = null;
    cancelFadeOut();
  }
}

function frame(nowMs) {
  if (!session) return;
  const dt = Math.min(0.1, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;
  const t = heardTime(ctx);

  // Show everyone whose time has come (up to what fits on screen); hide the
  // last ones again if the screen got smaller.
  const target = Math.min(faceCap, countJoined(Math.min(t, session.stopAt)));
  let changed = false;
  let entering = 0;
  while (session.shownCount < target) {
    const member = memberAt(session.shownCount++);
    member.face.element.classList.add('entering');
    // Several at once pop in one after another.
    member.face.element.style.setProperty('--enter-delay', `${entering++ * 60}ms`);
    stage.append(member.face.element);
    changed = true;
  }
  while (session.shownCount > target) {
    session.members[--session.shownCount].face.element.remove();
    changed = true;
  }
  if (changed) relayout();

  // Repainting the faces is the expensive part of a frame. In a large crowd
  // each face is updated every other frame (alternating halves), which still
  // gives it 30 fps, plenty for 4–5 "ha"s per second.
  const interleave = session.shownCount > INTERLEAVE_ABOVE;
  session.frameCount++;

  // Faces calm down together with the fade-out. After Stop the scene stands
  // still (but for the laughing), and whoever hadn't cracked stays silent.
  const calm = 1 - clamp01((t - session.fadeStart) / FADE_OUT);
  const sceneTime = Math.min(t, session.stopAt);
  for (let i = 0; i < session.shownCount; i++) {
    if (interleave && (i + session.frameCount) % 2) continue;
    const member = session.members[i];
    const memberDt = member.lastUpdateMs ? Math.min(0.1, (nowMs - member.lastUpdateMs) / 1000) : dt;
    member.lastUpdateMs = nowMs;
    const level = member.when > session.stopAt ? 0 : levelAt(member.levels, t);
    const raw = envelopeAt(member.voice.envelope, positionAt(member, t)) * level * calm;
    const pose = session.scene?.poseAt(i, sceneTime, session.positions);
    member.face.update(member.tracker.update(raw, memberDt), memberDt, pose);
  }

  if (t >= session.end) {
    finishSession();
  } else {
    requestAnimationFrame(frame);
  }
}

/** Number of characters whose join time is at or before `t`. */
function countJoined(t) {
  const times = session.joinTimes;
  let n = 0;
  while (n < times.length && times[n] <= t) n++;
  return n;
}

function finishSession() {
  if (!session) return;
  clearTimeout(session.hiddenTimer);
  for (const member of session.members) {
    try {
      member.source?.stop();
    } catch {
      // Already stopped by the Stop button (some engines reject a second stop).
    }
  }
  const { mode } = session;
  session = null;
  stopButton.hidden = true;
  endScreen.hidden = false;
  if (!document.hidden) endScreen.querySelector(`[data-mode="${mode}"]`).focus();
  releaseWakeLock();
  // Nothing is playing; let the audio hardware idle until the next session.
  ctx.suspend();
}

// ---- Screen wake lock ----
// Keeps the screen on during a session. The browser drops the lock whenever
// the page is hidden, so it is requested again on return (onVisibilityChange).

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !session || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    // E.g. battery saver; not fatal, the screen may just turn off.
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

/**
 * Replaces an element's text with one span per letter, so CSS can bounce
 * them individually (.bouncy in style.css). Screen readers get the plain
 * text through aria-label.
 */
function setBouncyText(element, text) {
  element.classList.add('bouncy');
  element.setAttribute('aria-label', text);
  element.replaceChildren(
    ...[...text].map((char, i) => {
      if (char === ' ') return document.createTextNode(' ');
      const letter = document.createElement('span');
      letter.textContent = char;
      letter.setAttribute('aria-hidden', 'true');
      letter.style.setProperty('--i', i);
      return letter;
    }),
  );
}

/** How many characters fit on screen; the voiced ones always do. */
function updateFaceCap() {
  const limit = maxItems(stage.clientWidth, stage.clientHeight, MIN_CELL_SIZE, MAX_FACES);
  faceCap = Math.max(voices.length, limit);
}

function relayout() {
  if (voices) updateFaceCap();
  const cells = [...stage.children];
  layoutCells(cells, stage);
  // Where everyone sits, so characters look the right way.
  if (session) session.positions = cellCenters(cells.length, stage);
}

function voiceScale(count) {
  return count ** -VOICE_SCALE_EXPONENT;
}

function randomOffset(voice) {
  return voice.loopStart + Math.random() * (voice.loopEnd - voice.loopStart);
}

/**
 * A point in the recording just before a laugh gets loud, so a voice that
 * bursts out starts with a bang.
 */
function burstOffset(voice) {
  const { values, windowSec } = voice.envelope;
  const from = Math.max(1, Math.ceil(voice.loopStart / windowSec));
  const to = Math.floor(voice.loopEnd / windowSec);
  const onsets = [];
  for (let w = from; w < to; w++) {
    if (values[w] > BURST_LEVEL && values[w - 1] <= BURST_LEVEL) onsets.push(w);
  }
  if (onsets.length === 0) return randomOffset(voice);
  const w = onsets[Math.floor(Math.random() * onsets.length)];
  return Math.max(voice.loopStart, (w - 3) * windowSec);
}

function shuffled(list) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Random order of the voices, but the first one is always an adult. */
function shuffledOrder(list) {
  const order = shuffled(list);
  const adult = order.findIndex((voice) => voice.type !== 'child');
  [order[0], order[adult]] = [order[adult], order[0]];
  return order;
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
