// audio.js — loading recordings, preparing seamless loops, playback and mixing.

// Length of the crossfade baked into each buffer at the loop seam (seconds).
const LOOP_CROSSFADE = 0.05;

// Samples quieter than this at the very start/end of a file are treated as
// encoder padding (digital silence) and left out of the loop.
const DIGITAL_SILENCE = 1e-4;

/**
 * Creates the AudioContext. Called on page load, so the context starts
 * suspended and is resumed later from the Start button's click handler.
 */
export function createAudioContext() {
  // iOS 16.4+: play through the silent switch, like a media app.
  if (navigator.audioSession) {
    try {
      navigator.audioSession.type = 'playback';
    } catch {
      // Not fatal; sound just follows the silent switch.
    }
  }
  return new AudioContext();
}

/**
 * Downloads all files in parallel, then decodes them one by one (to keep the
 * peak memory use low). Each result is a mono buffer with loop points.
 *
 * @param {AudioContext} ctx
 * @param {{url: string}[]} files
 * @param {(done: number, total: number) => void} onProgress
 */
export async function loadVoices(ctx, files, onProgress) {
  const downloads = files.map(async (file) => {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`${file.url}: HTTP ${res.status}`);
    return res.arrayBuffer();
  });

  const voices = [];
  for (let i = 0; i < files.length; i++) {
    const decoded = await ctx.decodeAudioData(await downloads[i]);
    const buffer = toMono(ctx, decoded);
    voices.push({ ...files[i], buffer, ...prepareLoop(buffer) });
    onProgress(voices.length, files.length);
  }
  return voices;
}

/** Mixes a multi-channel buffer down to a new mono buffer. */
function toMono(ctx, buffer) {
  if (buffer.numberOfChannels === 1) return buffer;

  const mono = ctx.createBuffer(1, buffer.length, buffer.sampleRate);
  const out = mono.getChannelData(0);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / channels;
  }
  return mono;
}

/**
 * Makes the buffer loop without a gap or click.
 *
 * Skips digital silence (mp3 encoder padding) at both ends, then crossfades
 * the last LOOP_CROSSFADE seconds of the audio into the first ones. Playback
 * loops from just after the crossfaded head, so the jump at loopEnd lands on
 * exactly the audio the tail was fading into.
 *
 * @returns {{loopStart: number, loopEnd: number}} loop points in seconds
 */
function prepareLoop(buffer) {
  const data = buffer.getChannelData(0);
  const rate = buffer.sampleRate;

  let head = 0;
  while (head < data.length && Math.abs(data[head]) < DIGITAL_SILENCE) head++;
  let tail = data.length;
  while (tail > head && Math.abs(data[tail - 1]) < DIGITAL_SILENCE) tail--;

  const fade = Math.min(Math.round(LOOP_CROSSFADE * rate), Math.floor((tail - head) / 4));
  for (let i = 0; i < fade; i++) {
    // Equal-power crossfade: the tail fades out while the head fades in.
    const t = (i / fade) * (Math.PI / 2);
    const j = tail - fade + i;
    data[j] = data[j] * Math.cos(t) + data[head + i] * Math.sin(t);
  }

  return { loopStart: (head + fade) / rate, loopEnd: tail / rate };
}

/**
 * Output chain shared by all voices:
 * voices → bus (scaled by voice count) → master (overall level, fade-out)
 * → compressor (safety net) → speakers.
 */
export function createMixer(ctx, masterLevel) {
  const bus = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = masterLevel;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  bus.connect(master).connect(compressor).connect(ctx.destination);
  return { bus, master, compressor };
}

/**
 * Schedules one voice to start looping at `when` (context time), from
 * `offset` seconds into its recording, fading in over `fadeIn` seconds.
 */
export function scheduleVoice(ctx, destination, voice, when, offset, fadeIn) {
  const source = ctx.createBufferSource();
  source.buffer = voice.buffer;
  source.loop = true;
  source.loopStart = voice.loopStart;
  source.loopEnd = voice.loopEnd;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(1, when + fadeIn);

  source.connect(gain).connect(destination);
  source.start(when, offset);
  source.onended = () => gain.disconnect();

  return { voice, source, gain, when, offset };
}

/**
 * Position (seconds into the recording) that a scheduled voice plays at
 * context time `t`, taking the start offset and looping into account.
 */
export function positionAt(player, t) {
  const { loopStart, loopEnd } = player.voice;
  let pos = player.offset + (t - player.when);
  if (pos >= loopEnd) pos = loopStart + ((pos - loopStart) % (loopEnd - loopStart));
  return pos;
}

/**
 * Context time of the sound the listener hears right now. currentTime runs
 * ahead of the speakers by the output latency, which on Bluetooth headphones
 * can reach ~200 ms.
 */
export function heardTime(ctx) {
  return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
}
