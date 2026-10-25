// contagion.js — the "Try not to laugh" scene.
//
// Twelve serious characters, one per recording. One of them starts laughing;
// the others look at it and at each other, fight the laugh (pressed lips,
// shaking shoulders) and crack one by one, faster and faster. The laugh
// spreads mostly to neighbours, so it travels across the screen. Once
// everyone laughs, they calm down, look straight at the viewer for a moment
// and burst out again, and that repeats every so often.
//
// The whole scene is planned up front, so every frame it can be read off at
// the time the listener is hearing, like the crowd.

// ---- Timing (seconds) ----
const FIRST_CRACK = 2.5; // the first character bursts out this long after the start
const FIRST_GAP = 12; // it laughs alone this long before the second one cracks...
const GAP_RATIO = 0.72; // ...and every following gap is this much shorter
const GAP_JITTER = 0.2; // ± relative randomness of the gaps
const BURST_FADE_IN = 0.12; // a laugh bursts out (voice fades in over this)
const TOGETHER = 7; // everybody laughs this long before the first calm-down
const CYCLE = 25; // later calm-downs come this far apart
const CALM_FADE = 1.5; // the laughter dies down over this...
const STARE = 2.5; // ...then they all look at the viewer this long...
const RELAPSE_SPREAD = 1.2; // ...and burst out again, the others within this after the first
const CALM_DOWNS = 20; // planned calm-downs (later the laughter just goes on)

// ---- Looks ----
const IDLE_LOOK = 0.35; // before anyone laughs, characters look around this little
const REACTION = [0.15, 0.6]; // delay before turning to someone who burst out
const GLANCE = [1.2, 2.6]; // how long a look lasts before the next one
const LOOK_AT_LAUGHING = 0.6; // chance a look goes to someone laughing (else to another struggler)

// ---- Struggle (the face's `hold`) ----
const PRESSURE_PER_LAUGHER = 0.12; // everyone fights a little harder per laughing character...
const PRESSURE_MAX = 0.5; // ...up to this
const LEAD = [1, 4]; // the final struggle before cracking: 70 % of the gap before, within these
const NEAR_CRACK_EVERY = 6; // about one near-crack per this many seconds of waiting (max 2)
const NEAR_CRACK = 0.8; // half-length of a near-crack
const SPREAD_SPONTANEOUS = 0.15; // weight of cracking without a laughing neighbour

const SERIOUS = { smile: 0, hold: 0, lookX: 0, lookY: 0 };
const LAUGHING = { smile: 1, hold: 0, lookX: 0, lookY: 0 };
const CALMING = { smile: 0.3, hold: 0.6, lookX: 0, lookY: 0 };

export const STARTING_POSE = SERIOUS;

const rand = ([min, max]) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Plans the scene.
 *
 * @param types     character type of each grid cell ('man' | 'woman' | 'child')
 * @param positions centre of each grid cell ({x, y}), at the start
 * @param start     context time of the start
 * @returns {{
 *   crackAt: number[],
 *   levels: (i: number) => {t: number, v: number}[],
 *   poseAt: (i: number, t: number, positions: {x: number, y: number}[]) => object,
 * }}
 */
export function planScene({ types, positions, start }) {
  const n = types.length;
  const order = crackOrder(types, positions);

  const crackAt = new Array(n);
  let t = start + FIRST_CRACK;
  order.forEach((m, k) => {
    if (k > 0) t += FIRST_GAP * GAP_RATIO ** (k - 1) * (1 + GAP_JITTER * (Math.random() * 2 - 1));
    crackAt[m] = t;
  });

  const calmAt = Array.from({ length: CALM_DOWNS }, (_, k) => t + TOGETHER + k * CYCLE);
  // In each calm-down one character bursts out first, the others follow.
  const relapseAt = calmAt.map((c) => {
    const first = Math.floor(Math.random() * n);
    const at = c + CALM_FADE + STARE;
    return Array.from({ length: n }, (_, m) => (m === first ? at : at + 0.3 + Math.random() * RELAPSE_SPREAD));
  });

  const struggles = order.map((m, k) => {
    const gap = k === 0 ? 0 : crackAt[m] - crackAt[order[k - 1]];
    const lead = Math.min(LEAD[1], Math.max(LEAD[0], gap * 0.7));
    const noticed = crackAt[order[0]] + rand(REACTION);
    return { m, lead, noticed, nearCracks: k === 0 ? [] : nearCracks(noticed + 2, crackAt[m] - lead - 2) };
  });
  const struggle = [];
  for (const s of struggles) struggle[s.m] = s;

  const looks = Array.from({ length: n }, (_, m) => planLooks(m, order, crackAt, positions, start));

  function holdAt(m, t) {
    const { lead, noticed, nearCracks } = struggle[m];
    let hold = 0;
    if (t >= noticed) {
      const laughing = crackAt.filter((c) => c <= t).length;
      hold = Math.min(PRESSURE_MAX, PRESSURE_PER_LAUGHER * laughing);
    }
    hold = Math.max(hold, smoothstep((t - (crackAt[m] - lead)) / lead));
    for (const c of nearCracks) hold = Math.max(hold, 0.95 * (1 - Math.abs(t - c) / NEAR_CRACK));
    return hold;
  }

  function poseAt(m, t, positions) {
    if (t >= crackAt[m]) {
      for (let k = calmAt.length - 1; k >= 0; k--) {
        if (t >= calmAt[k]) return t < relapseAt[k][m] ? CALMING : LAUGHING;
      }
      return LAUGHING;
    }

    // Still serious: the latest look, and how hard the laugh is held back.
    let look = looks[m][0];
    for (const l of looks[m]) {
      if (l.t > t) break;
      look = l;
    }
    let { x, y } = look;
    if (look.target !== undefined) {
      const from = positions[m];
      const to = positions[look.target];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      x = dx / len;
      y = dy / len;
    }
    return { smile: 0, hold: holdAt(m, t), lookX: x, lookY: y };
  }

  function levels(m) {
    const points = [
      { t: crackAt[m], v: 0 },
      { t: crackAt[m] + BURST_FADE_IN, v: 1 },
    ];
    calmAt.forEach((c, k) => {
      const back = relapseAt[k][m];
      points.push({ t: c, v: 1 }, { t: c + CALM_FADE, v: 0 }, { t: back, v: 0 }, { t: back + BURST_FADE_IN, v: 1 });
    });
    return points;
  }

  return { crackAt, levels, poseAt };
}

/**
 * Who cracks when: an adult starts, then each next one is drawn at random,
 * weighted by how close they sit to those already laughing.
 */
function crackOrder(types, positions) {
  const unit = cellDistance(positions);
  const adults = [...types.keys()].filter((i) => types[i] !== 'child');
  const order = [pick(adults.length ? adults : [...types.keys()])];
  const waiting = new Set(types.keys());
  waiting.delete(order[0]);

  while (waiting.size) {
    const candidates = [...waiting];
    const weights = candidates.map(
      (c) =>
        SPREAD_SPONTANEOUS +
        order.reduce((sum, l) => sum + (unit / distance(positions[c], positions[l])) ** 2, 0),
    );
    const next = candidates[weightedIndex(weights)];
    order.push(next);
    waiting.delete(next);
  }
  return order;
}

/**
 * Where character m looks until it cracks: around a little at first, then
 * at each one who bursts out, and in between at the laughing ones or at the
 * others fighting it, mostly those nearby.
 */
function planLooks(m, order, crackAt, positions, start) {
  const idle = () => ({ x: (Math.random() * 2 - 1) * IDLE_LOOK, y: (Math.random() * 2 - 1) * IDLE_LOOK * 0.5 });
  const looks = [{ t: -Infinity, ...idle() }, { t: start + rand([0.8, 1.6]), ...idle() }];
  const mine = order.indexOf(m);

  for (let k = 0; k < mine; k++) {
    const until = crackAt[order[k + 1]];
    let t = crackAt[order[k]] + rand(REACTION);
    let target = order[k];
    while (t < until) {
      looks.push({ t, target });
      t += rand(GLANCE);
      const laughing = order.slice(0, k + 1);
      const struggling = order.slice(k + 1).filter((o) => o !== m);
      const pool = struggling.length && Math.random() > LOOK_AT_LAUGHING ? struggling : laughing;
      target = pickNear(m, pool.length > 1 ? pool.filter((o) => o !== target) : pool, positions);
    }
  }
  return looks;
}

/** Up to two moments (times) of nearly cracking, between `from` and `to`. */
function nearCracks(from, to) {
  const span = to - from;
  if (span <= 0) return [];
  const count = Math.min(2, Math.floor((Math.random() * 2 * span) / NEAR_CRACK_EVERY));
  return Array.from({ length: count }, () => from + Math.random() * span);
}

/** One of `pool`, the closer to m the likelier. */
function pickNear(m, pool, positions) {
  const weights = pool.map((o) => 1 / distance(positions[m], positions[o]) ** 2);
  return pool[weightedIndex(weights)];
}

function weightedIndex(weights) {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;

/** Distance between neighbouring cells (the smallest one). */
function cellDistance(positions) {
  let min = Infinity;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) min = Math.min(min, distance(positions[i], positions[j]));
  }
  return Number.isFinite(min) ? min : 1;
}
