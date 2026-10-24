// faces.js — procedural SVG characters and their animation.
//
// Every character is drawn in a 100 × 100 viewBox from a few random
// parameters: type, skin, hair style and colour, small traits. update() is
// called once per frame with the laugh intensity and moves the face.

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- Palettes ----

const SKIN = ['#fde0c8', '#f5cba7', '#e9b48a', '#d29a6e', '#b57a4e', '#8d5a36', '#6b4226'];
const HAIR = ['#2a1b14', '#4a2e1d', '#6e4225', '#9a5b2c', '#c98a4a', '#e6c27a', '#b9442b'];
const GREY_HAIR = '#9a959e';
const BACKGROUND = ['#ffd8c4', '#ffe9a8', '#d6f1c6', '#c8e7f7', '#e4d6f8', '#fbd0e2', '#cdeee4', '#fff0d6'];
const SHIRT = ['#5b8def', '#ef7d5b', '#45b38e', '#a66be0', '#e8b33f', '#e85d8a', '#3fb0c9'];
const EYE = '#2a1f1b';
const MOUTH = '#5e1f26';
const TONGUE = '#e8697a';
const BLUSH = '#f07878';

// ---- Proportions per type (offsets are relative to the head centre) ----
//
// Children have a bigger head on a smaller body, larger eyes, and the face
// sits lower on the head (bigger forehead).

const TYPES = {
  man: {
    head: { cy: 47, rx: 24.5, ry: 27.5 },
    eyeY: -1, eyeGap: 0.4, eyeR: 3.4, eyeH: 4, browY: -7.5,
    noseY: 5.5, mouthY: 13, mouthW: 8.5, mouthOpen: 20,
    shoulders: 36, torsoTop: 84,
    hair: ['short', 'sidePart', 'curlyTop', 'bald'],
  },
  woman: {
    head: { cy: 47, rx: 23.5, ry: 27 },
    eyeY: -1, eyeGap: 0.41, eyeR: 3.5, eyeH: 4.3, browY: -7.5,
    noseY: 5.5, mouthY: 12.5, mouthW: 8, mouthOpen: 19,
    shoulders: 31, torsoTop: 85,
    hair: ['long', 'bob', 'bun', 'ponytail', 'curlyCloud'],
  },
  child: {
    head: { cy: 51, rx: 28.5, ry: 28 },
    eyeY: 3, eyeGap: 0.38, eyeR: 4.4, eyeH: 5.4, browY: -8,
    noseY: 9, mouthY: 15.5, mouthW: 7.5, mouthOpen: 17,
    shoulders: 25, torsoTop: 88,
    hair: ['tuft', 'pigtails', 'bowl', 'curlyTop'],
  },
};

// How amused the eyes look even when the character is quiet (0–1).
const RESTING_SQUINT = 0.3;

// With prefers-reduced-motion, head and body movement is scaled down to this.
const REDUCED_MOTION_SCALE = 0.2;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---- Small helpers ----

const round = (n) => Math.round(n * 100) / 100;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, typeof value === 'number' ? round(value) : value);
  }
  return node;
}

// Last value written per element and attribute. Repainting dozens of SVG
// faces is the expensive part of a frame, so unchanged values (e.g. a face
// that has settled during a pause) are not written again.
const written = new WeakMap();

function set(node, name, value) {
  let attrs = written.get(node);
  if (!attrs) written.set(node, (attrs = {}));
  if (attrs[name] === value) return;
  attrs[name] = value;
  node.setAttribute(name, value);
}

/** Darkens a #rrggbb colour by `amount` (0–1). */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c * (1 - amount)));
  return `rgb(${rgb.join(' ')})`;
}

/** One-pole smoother with separate rise and fall time constants. */
function smoother(rise, fall) {
  let value = 0;
  return (target, dt) => {
    value += (target - value) * (1 - Math.exp(-dt / (target > value ? rise : fall)));
    return value;
  };
}

// Draws without repeats until every option was used, so the characters of
// one session differ as much as the options allow.
const bags = new Map();
function draw(key, options) {
  let bag = bags.get(key);
  if (!bag || bag.length === 0) {
    bag = [...options];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    bags.set(key, bag);
  }
  return bag.pop();
}

// ---- Head geometry ----

/** Point on the head ellipse scaled by k, at `deg` (0 = right, 90 = top). */
function onHead(h, deg, k = 1) {
  const a = (deg * Math.PI) / 180;
  return [h.cx + h.rx * k * Math.cos(a), h.cy - h.ry * k * Math.sin(a)];
}

const pt = ([x, y]) => `${round(x)} ${round(y)}`;

/** SVG arc along the head ellipse scaled by k (clockwise on screen unless `counter`). */
const arcTo = (h, deg, k, large = 0, counter = false) =>
  `A ${round(h.rx * k)} ${round(h.ry * k)} 0 ${large} ${counter ? 0 : 1} ${pt(onHead(h, deg, k))}`;

/**
 * Hair covering the top of the head, with a hairline across the forehead.
 *
 * @param k        outer size relative to the head (volume on top)
 * @param temple   angle where the hair meets the sides of the face
 * @param hairline how far up the forehead the hairline peaks (× ry above centre)
 * @param part     horizontal shift of that peak (× rx), for side parts
 * @param bangs    [right, left] height of the hairline near the sides
 */
function capPath(h, { k = 1.06, temple = -6, hairline = 0.5, part = 0, bangs = [0.6, 0.6] } = {}) {
  const left = 180 - temple;
  const peakX = h.cx + part * h.rx;
  const peakY = h.cy - h.ry * hairline;
  return (
    `M ${pt(onHead(h, left))} L ${pt(onHead(h, left, k))} ${arcTo(h, temple, k, 1)} ` +
    `L ${pt(onHead(h, temple))} ` +
    `Q ${round(h.cx + h.rx * 0.95)} ${round(h.cy - h.ry * bangs[0])} ${round(peakX)} ${round(peakY)} ` +
    `Q ${round(h.cx - h.rx * 0.95)} ${round(h.cy - h.ry * bangs[1])} ${pt(onHead(h, left))} Z`
  );
}

/** Circles along the top of the head, for curly hair. */
function curls(h, { from, to, count, k, r }) {
  return Array.from({ length: count }, (_, i) => {
    const [cx, cy] = onHead(h, from + ((to - from) * i) / (count - 1), k);
    return el('circle', { cx, cy, r });
  });
}

// ---- Hair styles ----
//
// Each returns SVG nodes: `back` goes behind the head (and the body),
// `front` on top of it. Fill colour is applied by the caller unless set.

const HAIR_STYLES = {
  short: (h) => ({ front: [el('path', { d: capPath(h) })] }),

  sidePart: (h) => ({
    front: [el('path', { d: capPath(h, { k: 1.13, hairline: 0.42, part: -0.35, bangs: [0.3, 0.75] }) })],
  }),

  curlyTop: (h) => ({
    front: [
      el('path', { d: capPath(h, { k: 1.03, hairline: 0.52 }) }),
      ...curls(h, { from: 165, to: 15, count: 8, k: 1.0, r: h.rx * 0.21 }),
    ],
  }),

  // Hair only on the sides: a thin crescent hugging each side of the head.
  bald: (h) => ({
    front: [
      `M ${pt(onHead(h, 145, 1.04))} ${arcTo(h, 200, 1.04, 0, true)} ` +
        `Q ${round(h.cx - h.rx * 0.8)} ${round(h.cy - h.ry * 0.15)} ${pt(onHead(h, 145, 1.04))} Z`,
      `M ${pt(onHead(h, 35, 1.04))} ${arcTo(h, -20, 1.04, 0)} ` +
        `Q ${round(h.cx + h.rx * 0.8)} ${round(h.cy - h.ry * 0.15)} ${pt(onHead(h, 35, 1.04))} Z`,
    ].map((d) => el('path', { d })),
  }),

  long: (h) => {
    const w = h.rx * 1.18;
    const back =
      `M ${round(h.cx - w)} ${h.cy} A ${round(w)} ${round(h.ry * 1.12)} 0 1 1 ${round(h.cx + w)} ${h.cy} ` +
      `L ${round(h.cx + w + 2)} ${round(h.cy + h.ry * 1.45)} ` +
      `Q ${h.cx} ${round(h.cy + h.ry * 1.25)} ${round(h.cx - w - 2)} ${round(h.cy + h.ry * 1.45)} Z`;
    return {
      back: [el('path', { d: back })],
      front: [el('path', { d: capPath(h, { k: 1.08, hairline: 0.45, part: 0.2, bangs: [0.5, 0.3] }) })],
    };
  },

  bob: (h) => {
    const w = h.rx * 1.16;
    const bottom = h.cy + h.ry * 0.9;
    const back =
      `M ${round(h.cx - w)} ${h.cy} A ${round(w)} ${round(h.ry * 1.12)} 0 1 1 ${round(h.cx + w)} ${h.cy} ` +
      `L ${round(h.cx + w + 1)} ${round(bottom - 5)} Q ${round(h.cx + w + 1)} ${round(bottom + 1)} ${round(h.cx + w - 6)} ${round(bottom)} ` +
      `L ${round(h.cx - w + 6)} ${round(bottom)} Q ${round(h.cx - w - 1)} ${round(bottom + 1)} ${round(h.cx - w - 1)} ${round(bottom - 5)} Z`;
    return {
      back: [el('path', { d: back })],
      front: [el('path', { d: capPath(h, { k: 1.08, temple: -10, hairline: 0.3, bangs: [0.3, 0.3] }) })],
    };
  },

  bun: (h) => ({
    back: [el('circle', { cx: h.cx, cy: h.cy - h.ry * 1.02, r: h.rx * 0.42 })],
    front: [el('path', { d: capPath(h, { k: 1.05, hairline: 0.5, bangs: [0.65, 0.65] }) })],
  }),

  ponytail: (h, { accent }) => {
    const { cx, cy, rx, ry } = h;
    const tail =
      `M ${round(cx + rx * 0.55)} ${round(cy - ry * 0.85)} ` +
      `C ${round(cx + rx * 1.6)} ${round(cy - ry * 0.9)} ${round(cx + rx * 1.7)} ${round(cy + ry * 0.4)} ${round(cx + rx * 1.15)} ${round(cy + ry * 1.05)} ` +
      `C ${round(cx + rx * 1.25)} ${round(cy + ry * 0.3)} ${round(cx + rx * 1.05)} ${round(cy - ry * 0.3)} ${round(cx + rx * 0.7)} ${round(cy - ry * 0.45)} Z`;
    return {
      back: [el('path', { d: tail }), el('circle', { cx: cx + rx * 0.98, cy: cy - ry * 0.7, r: 2.6, fill: accent })],
      front: [el('path', { d: capPath(h, { k: 1.05, hairline: 0.48 }) })],
    };
  },

  curlyCloud: (h) => ({
    back: [
      ...curls(h, { from: 215, to: -35, count: 13, k: 1.05, r: h.rx * 0.36 }),
      el('ellipse', { cx: h.cx, cy: h.cy - h.ry * 0.1, rx: h.rx * 1.12, ry: h.ry * 1.05 }),
    ],
    front: [
      el('path', { d: capPath(h, { k: 1.04, hairline: 0.45 }) }),
      ...curls(h, { from: 150, to: 30, count: 5, k: 0.86, r: h.rx * 0.17 }),
    ],
  }),

  tuft: (h) => {
    const { cx, cy, ry } = h;
    const top = cy - ry;
    const tuft =
      `M ${round(cx - 4)} ${round(top + 2)} Q ${round(cx - 7)} ${round(top - 10)} ${round(cx + 5)} ${round(top - 9)} ` +
      `Q ${round(cx + 1)} ${round(top - 5)} ${round(cx + 4)} ${round(top + 2)} Z`;
    return {
      front: [el('path', { d: capPath(h, { k: 1.04, hairline: 0.5 }) }), el('path', { d: tuft })],
    };
  },

  // Two bunches high on the sides, sticking out, with hair ties in front.
  pigtails: (h, { accent }) => ({
    back: [-1, 1].map((side) =>
      el('ellipse', {
        cx: h.cx + side * h.rx * 1.22, cy: h.cy - h.ry * 0.42, rx: h.rx * 0.3, ry: h.rx * 0.22,
        transform: `rotate(${side * -25} ${round(h.cx + side * h.rx * 1.22)} ${round(h.cy - h.ry * 0.42)})`,
      }),
    ),
    front: [
      el('path', { d: capPath(h, { k: 1.04, hairline: 0.5, bangs: [0.7, 0.7] }) }),
      ...[-1, 1].map((side) =>
        el('circle', { cx: h.cx + side * h.rx * 0.97, cy: h.cy - h.ry * 0.5, r: 2.4, fill: accent }),
      ),
    ],
  }),

  bowl: (h) => ({
    front: [el('path', { d: capPath(h, { k: 1.1, temple: -14, hairline: 0.32, bangs: [0.32, 0.32] }) })],
  }),
};

/**
 * Beard along the jaw with a moustache, leaving the cheeks free. A hole
 * around the mouth (evenodd) keeps the resting smile visible; when the mouth
 * opens wider it is drawn on top of the beard.
 */
function beardPath(h, mouthY, mouthW) {
  const { cx, cy, rx, ry } = h;
  const holeRx = mouthW + 1.2;
  const holeRy = 3;
  return (
    `M ${pt(onHead(h, 207, 1.03))} ${arcTo(h, -27, 1.03, 0, true)} ` +
    `Q ${round(cx + rx * 0.72)} ${round(cy + ry * 0.62)} ${cx + 5} ${round(cy + ry * 0.33)} ` +
    `Q ${cx} ${round(cy + ry * 0.26)} ${cx - 5} ${round(cy + ry * 0.33)} ` +
    `Q ${round(cx - rx * 0.72)} ${round(cy + ry * 0.62)} ${pt(onHead(h, 207, 1.03))} Z ` +
    `M ${round(cx - holeRx)} ${round(mouthY + 1)} a ${round(holeRx)} ${holeRy} 0 1 0 ${round(holeRx * 2)} 0 ` +
    `a ${round(holeRx)} ${holeRy} 0 1 0 ${round(-holeRx * 2)} 0 Z`
  );
}

let faceCount = 0;

/**
 * Creates a character of the given type ('man' | 'woman' | 'child') with
 * randomized looks.
 *
 * @returns {{element: HTMLElement, update: (intensity: number, dt: number) => void}}
 */
export function createFace(type) {
  const spec = TYPES[type] ?? TYPES.man;
  const id = ++faceCount;
  const h = { cx: 50, ...spec.head };
  const { cx, cy, rx, ry } = h;

  const skin = draw('skin', SKIN);
  const skinShade = shade(skin, 0.12);
  const hairColor = type === 'man' && Math.random() < 0.15 ? GREY_HAIR : pick(HAIR);
  const shirt = pick(SHIRT);
  const accent = pick(SHIRT.filter((c) => c !== shirt));
  const hairStyle = draw(`hair-${type}`, spec.hair);
  const traits = {
    beard: type === 'man' && Math.random() < 0.35,
    glasses: type !== 'child' && Math.random() < 0.2,
    earrings: type === 'woman' && Math.random() < 0.5,
    freckles: type === 'child' && Math.random() < 0.5,
  };

  const cell = document.createElement('div');
  cell.className = 'cell';
  const svg = el('svg', { viewBox: '0 0 100 100' });
  svg.style.background = draw('background', BACKGROUND);
  cell.append(svg);

  // Layers, back to front. The head moves as a whole, but its back hair has
  // to sit behind the body, so it lives in its own group with the same motion.
  const headBack = el('g', { fill: hairColor });
  const body = el('g');
  const head = el('g');
  const features = el('g');
  svg.append(headBack, body, head);

  const hair = HAIR_STYLES[hairStyle](h, { accent });
  headBack.append(...(hair.back ?? []));

  // Body: neck, shoulders, a skin-coloured neckline.
  const top = spec.torsoTop;
  const W = spec.shoulders;
  body.append(
    el('rect', { x: cx - 6.5, y: cy + ry - 10, width: 13, height: top - (cy + ry - 10) + 6, fill: skinShade }),
    el('path', {
      d: `M ${cx - W} 104 C ${cx - W} ${top + 5} ${cx - W * 0.55} ${top} ${cx} ${top} C ${cx + W * 0.55} ${top} ${cx + W} ${top + 5} ${cx + W} 104 Z`,
      fill: shirt,
    }),
    el('path', { d: `M ${cx - 7} ${top} Q ${cx} ${top + 8} ${cx + 7} ${top} Z`, fill: skinShade }),
    el('path', {
      d: `M ${cx - 7.5} ${top} Q ${cx} ${top + 9} ${cx + 7.5} ${top}`,
      fill: 'none', stroke: shade(shirt, 0.15), 'stroke-width': 1.6, 'stroke-linecap': 'round',
    }),
  );

  // Head: ears, face, beard, hair on top.
  for (const side of [-1, 1]) {
    head.append(
      el('ellipse', { cx: cx + side * rx * 0.97, cy: cy + 3, rx: 4, ry: 5.5, fill: skin }),
      el('ellipse', { cx: cx + side * rx * 0.99, cy: cy + 3, rx: 1.8, ry: 3, fill: skinShade }),
    );
    if (traits.earrings) {
      head.append(el('circle', { cx: cx + side * rx * 0.99, cy: cy + 9, r: 1.6, fill: '#f2c14e' }));
    }
  }
  head.append(el('ellipse', { cx, cy, rx, ry, fill: skin }));
  if (traits.beard) {
    head.append(el('path', { d: beardPath(h, cy + spec.mouthY, spec.mouthW), fill: hairColor, 'fill-rule': 'evenodd' }));
  }
  const hairFront = el('g', { fill: hairColor });
  hairFront.append(...(hair.front ?? []));
  head.append(hairFront, features);

  // Face features. Positions below are the resting ones; update() moves them.
  const eyeY = cy + spec.eyeY;
  const eyeX = rx * spec.eyeGap;
  const browBase = eyeY + spec.browY;
  const mouthY = cy + spec.mouthY;

  const cheeks = [-1, 1].map((side) =>
    el('ellipse', { cx: cx + side * rx * 0.6, cy: eyeY + 8, rx: 4.5, ry: 2.8, fill: BLUSH, opacity: 0.4 }),
  );
  features.append(...cheeks);

  if (traits.freckles) {
    for (const side of [-1, 1]) {
      for (const [dx, dy] of [[-2.2, 0], [0.6, -1.4], [2.4, 0.8]]) {
        features.append(el('circle', { cx: cx + side * rx * 0.6 + dx, cy: eyeY + 7 + dy, r: 0.7, fill: shade(skin, 0.35), opacity: 0.7 }));
      }
    }
  }

  const noseY = cy + spec.noseY;
  features.append(
    el('path', {
      d: `M ${cx - 2} ${noseY} Q ${cx} ${noseY + 2.6} ${cx + 2} ${noseY}`,
      fill: 'none', stroke: shade(skin, 0.28), 'stroke-width': 1.4, 'stroke-linecap': 'round',
    }),
  );

  const eyes = [-1, 1].map(() => el('path', { fill: EYE }));
  const sparkles = [-1, 1].map((side) =>
    el('circle', { cx: cx + side * eyeX + spec.eyeR * 0.35, cy: eyeY - spec.eyeH * 0.3, r: spec.eyeR * 0.28, fill: '#fff' }),
  );
  const brows = [-1, 1].map(() =>
    el('path', {
      fill: 'none', stroke: shade(hairColor, 0.3),
      'stroke-width': type === 'child' ? 1.8 : 2, 'stroke-linecap': 'round',
    }),
  );
  features.append(...eyes, ...sparkles, ...brows);

  if (traits.glasses) {
    const r = spec.eyeR * 1.75;
    const frame = { fill: '#ffffff', 'fill-opacity': 0.15, stroke: '#2b2a33', 'stroke-width': 1.3 };
    features.append(
      el('circle', { cx: cx - eyeX, cy: eyeY, r, ...frame }),
      el('circle', { cx: cx + eyeX, cy: eyeY, r, ...frame }),
      el('path', { d: `M ${cx - eyeX + r} ${eyeY} Q ${cx} ${eyeY - 2} ${cx + eyeX - r} ${eyeY}`, fill: 'none', stroke: '#2b2a33', 'stroke-width': 1.3 }),
    );
  }

  // Mouth: dark opening, with teeth and tongue clipped to it, and an outline
  // that keeps the closed smile visible.
  const clipId = `mouth-clip-${id}`;
  const clipShape = el('path');
  const clip = el('clipPath', { id: clipId });
  clip.append(clipShape);
  const mouth = el('path', { fill: MOUTH });
  const inside = el('g', { 'clip-path': `url(#${clipId})` });
  const teeth = el('path', { fill: '#ffffff' });
  const tongue = el('ellipse', { fill: TONGUE });
  inside.append(teeth, tongue);
  const lips = el('path', { fill: 'none', stroke: MOUTH, 'stroke-width': 1.5, 'stroke-linejoin': 'round' });
  features.append(clip, mouth, inside, lips);

  // Each feature follows the same intensity with its own timing, so the
  // motion doesn't look rigidly identical.
  const eyeSmooth = smoother(0.1, 0.35);
  const browSmooth = smoother(0.15, 0.5);
  const cheekSmooth = smoother(0.2, 0.5);
  const leanSmooth = smoother(0.12, 0.45);
  const wobbleSide = Math.random() < 0.5 ? -1 : 1;
  let phase = Math.random() * 10;

  function update(intensity, dt) {
    const squint = RESTING_SQUINT + (1 - RESTING_SQUINT) * eyeSmooth(intensity, dt);
    const brow = browSmooth(intensity, dt);
    const lift = cheekSmooth(intensity, dt);
    const lean = leanSmooth(intensity, dt);
    const motion = reducedMotion.matches ? REDUCED_MOTION_SCALE : 1;
    phase += dt;

    // Eyes: an almond whose lower lid rises into a thin arc ("^") as they squint.
    const lower = eyeY + spec.eyeH * (1 - squint * 1.6);
    eyes.forEach((eye, i) => {
      const x = cx + (i === 0 ? -eyeX : eyeX);
      set(
        eye,
        'd',
        `M ${round(x - spec.eyeR)} ${eyeY} Q ${x} ${round(eyeY - spec.eyeH)} ${round(x + spec.eyeR)} ${eyeY} ` +
          `Q ${x} ${round(lower)} ${round(x - spec.eyeR)} ${eyeY} Z`,
      );
    });
    const sparkle = round(clamp01((0.75 - squint) / 0.45));
    for (const s of sparkles) set(s, 'opacity', sparkle);

    // Brows go up when laughing, inner ends more than outer ones.
    brows.forEach((b, i) => {
      const side = i === 0 ? -1 : 1;
      const x = cx + side * eyeX;
      const y = browBase - brow * 2.5;
      const inner = x - side * 3.5;
      const outer = x + side * 3.5;
      set(
        b,
        'd',
        `M ${round(inner)} ${round(y + 0.8 - brow * 1.6)} Q ${round(x)} ${round(y - 1.6)} ${round(outer)} ${round(y + 1)}`,
      );
    });

    for (const c of cheeks) set(c, 'cy', round(eyeY + 8 - lift * 2.5));

    // Mouth: a smile at rest, opening smoothly with the laugh.
    const open = intensity ** 0.85;
    const w = spec.mouthW * (1 + 0.22 * open);
    const corner = mouthY - 1 - lift * 1.5;
    const upper = mouthY + 1.2;
    const lowerLip = mouthY + 3.5 + open * spec.mouthOpen;
    const shape =
      `M ${round(cx - w)} ${round(corner)} Q ${cx} ${round(upper)} ${round(cx + w)} ${round(corner)} ` +
      `Q ${cx} ${round(lowerLip)} ${round(cx - w)} ${round(corner)} Z`;
    set(mouth, 'd', shape);
    set(clipShape, 'd', shape);
    set(lips, 'd', shape);
    set(
      teeth,
      'd',
      `M ${round(cx - w)} ${round(corner)} Q ${cx} ${round(upper)} ${round(cx + w)} ${round(corner)} ` +
        `L ${round(cx + w)} ${round(corner + 3)} Q ${cx} ${round(upper + 3)} ${round(cx - w)} ${round(corner + 3)} Z`,
    );
    set(teeth, 'opacity', round(clamp01(open * 4 - 0.4)));
    const bottom = (corner + lowerLip) / 2;
    set(tongue, 'cx', cx);
    set(tongue, 'cy', round(bottom - 1.5));
    set(tongue, 'rx', round(w * 0.5));
    set(tongue, 'ry', 3.2);
    set(tongue, 'opacity', round(clamp01(open * 3 - 0.3)));

    // Head leans back (moves up, face lifts a little) with a quick shake and
    // a slow wobble; shoulders bounce along.
    const shake = Math.sin(phase * 2 * Math.PI * 8.5) * lean * 1.3 * motion;
    const wobble = Math.sin(phase * 2 * Math.PI * 1.2) * lean * 5 * wobbleSide * motion;
    const headMove = `translate(0 ${round(-lean * 3.5 * motion + shake)}) rotate(${round(wobble)} ${cx} ${cy + ry})`;
    set(head, 'transform', headMove);
    set(headBack, 'transform', headMove);
    set(features, 'transform', `translate(0 ${round(-lean * 1.2 * motion)})`);
    set(body, 'transform', `translate(0 ${round(shake * 0.5 - lean * 0.8 * motion)})`);
  }

  update(0, 1);
  return { element: cell, update };
}
