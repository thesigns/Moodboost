// faces.js — procedural SVG characters and their animation.
//
// NOTE: prototype placeholder. Simple round faces that already react to the
// laugh intensity; the final characters come in a later step.

const SVG_NS = 'http://www.w3.org/2000/svg';

const SKIN = ['#f6d2b8', '#eab894', '#d49c72', '#a8714c', '#7c4e32'];
const HAIR = ['#2b1d16', '#5a3a22', '#8b5a2b', '#c98e4b', '#e3c27a', '#a0472b', '#3d3d3d'];
const BACKGROUND = ['#ffd9c2', '#ffeab0', '#d4f0c4', '#c7e6f5', '#e3d4f7', '#f9cfe0', '#cdeee6'];
const SHIRT = ['#5b8def', '#ef7d5b', '#4fb894', '#b46be0', '#e8b33f'];

// Proportions per character type. Children: bigger head and eyes.
const TYPES = {
  man: { headY: 50, headR: 28, eyeR: 4.2, eyeH: 4.4 },
  woman: { headY: 50, headR: 27, eyeR: 4.4, eyeH: 4.8 },
  child: { headY: 53, headR: 31, eyeR: 5.2, eyeH: 6 },
};

// How amused the eyes look even when the character is quiet (0–1).
const RESTING_SQUINT = 0.3;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** One-pole smoother with separate rise and fall time constants. */
function smoother(rise, fall) {
  let value = 0;
  return (target, dt) => {
    value += (target - value) * (1 - Math.exp(-dt / (target > value ? rise : fall)));
    return value;
  };
}

function hairPaths(type, cx, cy, r) {
  const cap =
    `M ${cx - r} ${cy - 4} Q ${cx - r + 2} ${cy - r - 5} ${cx} ${cy - r - 5} ` +
    `Q ${cx + r - 2} ${cy - r - 5} ${cx + r} ${cy - 4} ` +
    `Q ${cx + r * 0.75} ${cy - r * 0.7} ${cx} ${cy - r * 0.72} ` +
    `Q ${cx - r * 0.75} ${cy - r * 0.7} ${cx - r} ${cy - 4} Z`;

  if (type === 'woman') {
    const back =
      `M ${cx - r - 4} ${cy} Q ${cx - r - 4} ${cy - r - 8} ${cx} ${cy - r - 8} ` +
      `Q ${cx + r + 4} ${cy - r - 8} ${cx + r + 4} ${cy} L ${cx + r + 6} ${cy + r + 2} ` +
      `Q ${cx} ${cy + r - 6} ${cx - r - 6} ${cy + r + 2} Z`;
    return { back, front: cap };
  }
  if (type === 'child') {
    const tuft =
      `M ${cx - 6} ${cy - r + 1} Q ${cx - 4} ${cy - r - 12} ${cx + 4} ${cy - r - 9} ` +
      `Q ${cx} ${cy - r - 4} ${cx + 3} ${cy - r + 1} Z`;
    return { back: null, front: cap + ' ' + tuft };
  }
  return { back: null, front: cap };
}

/**
 * Creates a character of the given type ('man' | 'woman' | 'child') with
 * randomized colours.
 *
 * @returns {{element: HTMLElement, update: (intensity: number, dt: number) => void}}
 */
export function createFace(type) {
  const t = TYPES[type] ?? TYPES.man;
  const cx = 50;
  const cy = t.headY;
  const r = t.headR;
  const skin = pick(SKIN);
  const hairColor = pick(HAIR);

  const cell = document.createElement('div');
  cell.className = 'cell';
  const svg = el('svg', { viewBox: '0 0 100 100' });
  svg.style.background = pick(BACKGROUND);
  cell.append(svg);

  const body = el('g');
  const head = el('g');
  const hair = hairPaths(type, cx, cy, r);

  body.append(el('ellipse', { cx, cy: 108, rx: 36, ry: 26, fill: pick(SHIRT) }));
  if (hair.back) head.append(el('path', { d: hair.back, fill: hairColor }));
  head.append(
    el('circle', { cx: cx - r + 1, cy: cy + 4, r: 5, fill: skin }),
    el('circle', { cx: cx + r - 1, cy: cy + 4, r: 5, fill: skin }),
    el('circle', { cx, cy, r, fill: skin }),
    el('path', { d: hair.front, fill: hairColor }),
  );

  const cheeks = [-1, 1].map((side) =>
    el('ellipse', { cx: cx + side * r * 0.62, cy: cy + 9, rx: 5, ry: 3.2, fill: '#f27a7a', opacity: 0.45 }),
  );
  const eyes = [-1, 1].map(() => el('path', { fill: '#2a1f1b' }));
  const mouth = el('path', { fill: '#7a2b2b' });
  head.append(...cheeks, ...eyes, mouth);
  body.append(head);
  svg.append(body);

  const eyeX = r * 0.38;
  const eyeY = cy - 3;
  const mouthY = cy + 11;

  // Each feature follows the same intensity with its own timing, so the
  // motion doesn't look rigidly identical.
  const eyeSmooth = smoother(0.12, 0.35);
  const cheekSmooth = smoother(0.2, 0.5);
  const bodySmooth = smoother(0.15, 0.4);
  const wobbleSide = Math.random() < 0.5 ? -1 : 1;
  let phase = Math.random() * 10;

  function update(intensity, dt) {
    const squint = RESTING_SQUINT + (1 - RESTING_SQUINT) * eyeSmooth(intensity, dt);
    const lift = cheekSmooth(intensity, dt);
    const burst = bodySmooth(intensity, dt);
    phase += dt;

    // Eyes: an almond shape whose lower lid rises into an upward arc ("^").
    // squint 0 → round open eye, 1 → thin arc.
    const lower = eyeY + t.eyeH * (1 - squint * 1.6);
    eyes.forEach((eye, i) => {
      const x = cx + (i === 0 ? -eyeX : eyeX);
      eye.setAttribute(
        'd',
        `M ${x - t.eyeR} ${eyeY} Q ${x} ${eyeY - t.eyeH} ${x + t.eyeR} ${eyeY} ` +
          `Q ${x} ${lower} ${x - t.eyeR} ${eyeY} Z`,
      );
    });

    // Mouth: a smile at rest, opening smoothly with the laugh.
    const w = 10 + intensity * 2.5;
    const corner = mouthY - 1 - lift;
    mouth.setAttribute(
      'd',
      `M ${cx - w} ${corner} Q ${cx} ${mouthY + 3} ${cx + w} ${corner} ` +
        `Q ${cx} ${mouthY + 5 + intensity * 15} ${cx - w} ${corner} Z`,
    );

    cheeks.forEach((cheek) => cheek.setAttribute('cy', cy + 9 - lift * 3));

    // Head and body: lean back on bursts, with a quick shake and a slow wobble.
    const shake = Math.sin(phase * 2 * Math.PI * 9) * burst * 1.2;
    const wobble = Math.sin(phase * 2 * Math.PI * 1.3) * burst * 5 * wobbleSide;
    head.setAttribute('transform', `translate(0 ${-burst * 4 + shake}) rotate(${wobble} ${cx} ${cy + r})`);
    body.setAttribute('transform', `translate(0 ${shake * 0.5})`);
  }

  update(0, 1);
  return { element: cell, update };
}
