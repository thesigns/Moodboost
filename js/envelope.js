// envelope.js — precomputed loudness envelopes and the "laugh intensity"
// signal derived from them.

/**
 * Computes a normalized RMS envelope of a mono buffer.
 *
 * Values are scaled so the 95th percentile maps to 1 (and clamped there),
 * so a few extreme peaks don't flatten the rest of the recording.
 *
 * @param {AudioBuffer} buffer
 * @param {number} windowSec length of one analysis window
 * @returns {{values: Float32Array, windowSec: number}}
 */
export function computeEnvelope(buffer, windowSec) {
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.round(windowSec * buffer.sampleRate));
  const count = Math.ceil(data.length / size);
  const values = new Float32Array(count);

  for (let w = 0; w < count; w++) {
    const start = w * size;
    const end = Math.min(start + size, data.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    values[w] = Math.sqrt(sum / (end - start));
  }

  const sorted = Float32Array.from(values).sort();
  const reference = sorted[Math.floor(0.95 * (count - 1))] || 1;
  for (let w = 0; w < count; w++) values[w] = Math.min(1, values[w] / reference);

  return { values, windowSec: size / buffer.sampleRate };
}

/** Envelope value at `pos` seconds, linearly interpolated between windows. */
export function envelopeAt(envelope, pos) {
  const { values, windowSec } = envelope;
  // Each value describes the centre of its window.
  const x = Math.max(0, pos / windowSec - 0.5);
  const i = Math.floor(x);
  if (i >= values.length - 1) return values[values.length - 1];
  const frac = x - i;
  return values[i] * (1 - frac) + values[i + 1] * frac;
}

/**
 * Turns raw envelope values into a smooth laugh intensity (0–1):
 * a gate with hysteresis (no flicker around the threshold), then
 * a fast-attack / slower-release smoother.
 */
export function createIntensityTracker({ gateOpen, gateClose, attack, release }) {
  let open = false;
  let value = 0;

  return {
    /**
     * @param {number} raw envelope value (0–1)
     * @param {number} dt seconds since the previous update
     */
    update(raw, dt) {
      if (open ? raw < gateClose : raw > gateOpen) open = !open;

      // Rescale so the signal starts at 0 right at the closing threshold.
      const target = open ? Math.max(0, (raw - gateClose) / (1 - gateClose)) : 0;
      const tau = target > value ? attack : release;
      value += (target - value) * (1 - Math.exp(-dt / tau));
      return value;
    },
  };
}
