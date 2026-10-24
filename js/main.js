// main.js — session flow and screens.
//
// The whole session is scheduled on the audio clock when it starts. The
// visuals never keep their own timeline: every frame they are derived from
// the time the listener is hearing, so they stay in sync even after the tab
// was in the background (where timers and animation frames are throttled).

import {
  createAudioContext,
  createMixer,
  heardTime,
  loadVoices,
  positionAt,
  scheduleVoice,
} from './audio.js';
import { computeEnvelope, createIntensityTracker, envelopeAt } from './envelope.js';
import { createFace } from './faces.js';
import { layoutCells } from './layout.js';

// ---- Session timing (seconds) ----
const JOIN_INTERVAL = 6; // between one character joining and the next
const FULL_CHORUS = 18; // everyone laughing after the last one joined
const FADE_OUT = 6; // final fade-out
const VOICE_FADE_IN = 1; // a new voice ramps up from silence over this
const START_DELAY = 0.1; // scheduling headroom after pressing Start

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
const startButton = document.getElementById('btn-start');
const againButton = document.getElementById('btn-again');
const stopButton = document.getElementById('btn-stop');
const loadError = document.getElementById('load-error');

const ctx = createAudioContext();
const mixer = createMixer(ctx, MASTER_LEVEL);

let voices = null;
let session = null;
let lastFrameMs = 0;

setBouncyText(title, title.textContent);
setBouncyText(againButton, againButton.textContent);

// Start loading right away; the Start button waits until everything is ready.
loadVoices(ctx, FILES, (done, total) => {
  setBouncyText(startButton, `Loading… ${done}/${total}`);
})
  .then((loaded) => {
    voices = loaded.map((voice) => ({
      ...voice,
      envelope: computeEnvelope(voice.buffer, ENVELOPE_WINDOW),
    }));
    setBouncyText(startButton, 'Start');
    startButton.disabled = false;
  })
  .catch((error) => {
    console.error(error);
    setBouncyText(startButton, 'Unavailable');
    loadError.textContent =
      location.protocol === 'file:'
        ? "Couldn't load the recordings. Open the app through a web server, not as a local file."
        : "Couldn't load the recordings. Check your connection and reload the page.";
    loadError.hidden = false;
  });

startButton.addEventListener('click', begin);
againButton.addEventListener('click', begin);
stopButton.addEventListener('click', stopEarly);
window.addEventListener('resize', relayout);

async function begin() {
  if (!voices || session) return;
  startButton.disabled = true;
  againButton.disabled = true;
  // resume() has to be called directly from the click (autoplay rules, iOS).
  await ctx.resume();
  startButton.disabled = false;
  againButton.disabled = false;
  startSession();
}

function startSession() {
  const now = ctx.currentTime;
  const firstJoin = now + START_DELAY;

  const players = shuffledOrder(voices).map((voice, i) => {
    const offset = voice.loopStart + Math.random() * (voice.loopEnd - voice.loopStart);
    const when = firstJoin + i * JOIN_INTERVAL;
    const player = scheduleVoice(ctx, mixer.bus, voice, when, offset, VOICE_FADE_IN);
    return {
      ...player,
      face: createFace(voice.type),
      tracker: createIntensityTracker({
        gateOpen: GATE_OPEN,
        gateClose: GATE_CLOSE,
        attack: ATTACK,
        release: RELEASE,
      }),
      shown: false,
      skipped: false,
    };
  });

  // Keep the total level steady as voices join: ramp the shared bus from
  // the scale for i voices to the scale for i + 1 while the new one fades in.
  const bus = mixer.bus.gain;
  bus.cancelScheduledValues(0);
  bus.setValueAtTime(1, now);
  players.forEach((player, i) => {
    if (i === 0) return;
    bus.setValueAtTime(voiceScale(i), player.when);
    bus.linearRampToValueAtTime(voiceScale(i + 1), player.when + VOICE_FADE_IN);
  });

  const master = mixer.master.gain;
  master.cancelScheduledValues(0);
  master.setValueAtTime(MASTER_LEVEL, now);

  session = { players, fadeStart: Infinity, end: Infinity };
  scheduleFadeOut(players[players.length - 1].when + FULL_CHORUS);

  stage.replaceChildren();
  startScreen.hidden = true;
  endScreen.hidden = true;
  stopButton.hidden = false;
  lastFrameMs = performance.now();
  requestAnimationFrame(frame);
}

/** Schedules the fade-out (and the end of every voice) at context time `at`. */
function scheduleFadeOut(at) {
  const master = mixer.master.gain;
  master.cancelScheduledValues(at);
  master.setValueAtTime(MASTER_LEVEL, at);
  master.exponentialRampToValueAtTime(MASTER_LEVEL * 0.001, at + FADE_OUT);
  master.setValueAtTime(0, at + FADE_OUT);

  // Voices that haven't started by then never will. On an early stop this
  // replaces the stop time scheduled at session start.
  for (const player of session.players) {
    try {
      player.source.stop(at + FADE_OUT);
    } catch {
      // Older engines reject a second stop(); the master fade still silences it.
    }
  }

  session.fadeStart = at;
  session.end = at + FADE_OUT;
}

/** Stop button: skip straight to the fade-out. */
function stopEarly() {
  if (!session) return;
  const now = ctx.currentTime;
  const at = now + 0.05;
  if (at >= session.fadeStart) return;

  for (const player of session.players) {
    if (player.when > at) player.skipped = true;
  }

  // Freeze the voice-count scaling where it is.
  const bus = mixer.bus.gain;
  const level = bus.value;
  bus.cancelScheduledValues(now);
  bus.setValueAtTime(level, now);

  scheduleFadeOut(at);
}

function frame(nowMs) {
  if (!session) return;
  const dt = Math.min(0.1, Math.max(0.001, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;
  const t = heardTime(ctx);

  let joined = false;
  for (const player of session.players) {
    if (!player.shown && !player.skipped && t >= player.when) {
      player.shown = true;
      player.face.element.classList.add('entering');
      stage.append(player.face.element);
      joined = true;
    }
  }
  if (joined) relayout();

  // Faces calm down together with the fade-out.
  const calm = 1 - clamp01((t - session.fadeStart) / FADE_OUT);
  for (const player of session.players) {
    if (!player.shown) continue;
    const fadeIn = clamp01((t - player.when) / VOICE_FADE_IN);
    const raw = envelopeAt(player.voice.envelope, positionAt(player, t)) * fadeIn * calm;
    player.face.update(player.tracker.update(raw, dt), dt);
  }

  if (t >= session.end) {
    finishSession();
  } else {
    requestAnimationFrame(frame);
  }
}

function finishSession() {
  session = null;
  stopButton.hidden = true;
  endScreen.hidden = false;
  againButton.focus();
  // Nothing is playing; let the audio hardware idle until the next session.
  ctx.suspend();
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

function relayout() {
  const cells = [...stage.children];
  layoutCells(cells, stage);
}

function voiceScale(count) {
  return count ** -VOICE_SCALE_EXPONENT;
}

/** Random order of the voices, but the first one is always an adult. */
function shuffledOrder(list) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const adult = order.findIndex((voice) => voice.type !== 'child');
  [order[0], order[adult]] = [order[adult], order[0]];
  return order;
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}
