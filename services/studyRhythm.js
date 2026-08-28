/**
 * Study rhythms: how a session is chopped into work blocks and breaks.
 *
 * Everything here is pure. The screen holds no cycle state of its own — it
 * asks `phaseAt` where the session is, exactly the way the timer already asks
 * the wall clock how much time is left. That is deliberate: the timer survives
 * Android throttling its interval precisely because it never counts, it
 * derives. Cycles inherit that for free instead of maintaining a parallel
 * state machine that would have to be kept in sync by hand.
 */

/** Continuo is the rhythm that isn't one: a single block with no break. */
export const RHYTHMS = {
  continuo: { work: 25, rest: 0, blocks: 1, cyclic: false },
  pomodoro: { work: 25, rest: 5, blocks: 4, cyclic: true },
  // 52·17 renamed. Ours by adoption, not by discovery — see the explainer in
  // components/RhythmPicker.js, which credits DeskTime.
  schedioStudy: { work: 52, rest: 17, blocks: 2, cyclic: true, explain: true },
  custom: { work: 30, rest: 10, blocks: 3, cyclic: true },
};

export const RHYTHM_LABELS = {
  continuo: 'Continuo',
  pomodoro: 'Pomodoro',
  schedioStudy: 'Schedio Study',
  custom: 'Personalizado',
};

export const RHYTHM_ORDER = ['continuo', 'pomodoro', 'schedioStudy', 'custom'];

export const DEFAULT_RHYTHM = 'continuo';

/**
 * Bounds. The cyclic sliders step by 1, not by 5: at a step of 5 neither 52
 * nor 17 is reachable, so the Schedio Study preset couldn't even be shown.
 */
export const WORK_BOUNDS = { min: 10, max: 90 };
export const REST_BOUNDS = { min: 1, max: 30 };
export const BLOCK_BOUNDS = { min: 1, max: 8 };
/** Continuo keeps the slider the screen has always had. */
export const CONTINUO_BOUNDS = { min: 15, max: 120, step: 5 };

export const isCyclic = (mode) => !!RHYTHMS[mode]?.cyclic;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Every stored rhythm passes through here, so a corrupted preference — or one
 * written by a version that didn't have rhythms — can't put the timer into a
 * state with no way out. The bounds are the union of both modes: Continuo
 * reaches 120 minutes, the cyclic ones start as low as 10.
 */
export const normalizeRhythm = (rhythm) => ({
  work: clamp(
    Math.round(Number(rhythm?.work) || RHYTHMS.continuo.work),
    WORK_BOUNDS.min,
    CONTINUO_BOUNDS.max
  ),
  // Zero is legal and is exactly what Continuo is: no break at all.
  rest: clamp(Math.round(Number(rhythm?.rest) || 0), 0, REST_BOUNDS.max),
  blocks: clamp(Math.round(Number(rhythm?.blocks) || 1), BLOCK_BOUNDS.min, BLOCK_BOUNDS.max),
});

/** Work minutes (what counts) and wall-clock minutes (what it costs). They
 *  are shown separately on purpose so nobody is surprised at the summary. */
export const sessionTotals = (rhythm) => {
  const { work, rest, blocks } = normalizeRhythm(rhythm);
  const workMinutes = work * blocks;
  return {
    workMinutes,
    elapsedMinutes: workMinutes + rest * (blocks - 1),
  };
};

/**
 * Where the session is, given how many seconds of it have actually run.
 *
 * The break sits *between* blocks, never after the last one — finishing a
 * session on five minutes of nothing is finishing on nothing. That is why the
 * total subtracts one break rather than multiplying by `blocks`.
 *
 * @param {number} elapsedSeconds - active seconds: wall clock minus pauses,
 *   plus any break the student skipped past.
 * @returns {{phase: 'work'|'break', block: number, remaining: number,
 *   workDone: number, total: number, finished: boolean}}
 */
export const phaseAt = (elapsedSeconds, rhythm) => {
  const { work, rest, blocks } = normalizeRhythm(rhythm);
  const workSecs = work * 60;
  const restSecs = rest * 60;
  const total = blocks * workSecs + (blocks - 1) * restSecs;

  const e = Math.max(0, Number(elapsedSeconds) || 0);

  // Checked before the phase maths, not after: at exactly `total` the modulo
  // below would report the start of a block that doesn't exist.
  if (e >= total) {
    return {
      phase: 'work',
      block: blocks,
      remaining: 0,
      workDone: blocks * workSecs,
      total,
      finished: true,
    };
  }

  const cycle = workSecs + restSecs;
  const completed = Math.floor(e / cycle);
  const intoCycle = e - completed * cycle;
  const working = intoCycle < workSecs;

  return {
    phase: working ? 'work' : 'break',
    block: Math.min(blocks, completed + 1),
    remaining: working ? workSecs - intoCycle : cycle - intoCycle,
    // Only the work half of each cycle counts. This is the number that ends up
    // as XP, streak minutes, totalTime and badge input — all four read the same
    // `duration` field on the saved session.
    workDone: completed * workSecs + Math.min(intoCycle, workSecs),
    total,
    finished: false,
  };
};

/**
 * Shown one per break, rotated so the same line doesn't come round twice in an
 * afternoon. They exist because a blank screen for five minutes is an
 * invitation to open another app — the break needs something to look at.
 */
export const BREAK_TIPS = [
  'Los descansos son para aburrirse, no para scrollear.',
  'Levántate. En serio, levántate.',
  'Bebe agua. Es lo más barato que puedes hacer por tu concentración.',
  'Mira algo lejos. Tus ojos llevan un rato a treinta centímetros.',
  'Si abres el móvil ahora, el descanso deja de ser un descanso.',
  'Estira la espalda. Tu yo de esta noche te lo agradece.',
  'No mires los apuntes. El descanso es parte del método, no tiempo perdido.',
  'Camina hasta la cocina y vuelve. Ya está, eso es todo.',
  'Respira hondo tres veces. Suena tonto y funciona.',
  'Tu cabeza sigue trabajando ahora mismo, aunque no lo notes.',
  'Ni pantallas ni notificaciones. Cinco minutos de nada también cuentan.',
  'Abre la ventana. El aire cargado da más sueño que el temario.',
  'Come algo si llevas horas. El azúcar bajo se parece mucho a la desgana.',
  'Si te apetece seguir, salta el descanso. Pero solo si te apetece de verdad.',
  'Descansar bien es lo que hace que el siguiente bloque no sea peor.',
];

/** Keyed by block so the tip is stable across re-renders within one break —
 *  a line that reshuffles every second would be unreadable. */
export const breakTipFor = (block) => BREAK_TIPS[Math.abs(block) % BREAK_TIPS.length];

/** How long a session with this rhythm could possibly last, plus a grace
 *  window. Replaces the fixed 150-minute staleness cut-off, which a four-block
 *  Schedio Study session (259 min) would have blown past — the snapshot of a
 *  perfectly live session was being thrown away. */
export const staleAfterMs = (rhythm, graceMinutes = 30) =>
  (sessionTotals(rhythm).elapsedMinutes + graceMinutes) * 60 * 1000;
