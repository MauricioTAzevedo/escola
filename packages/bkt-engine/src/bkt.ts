export interface BKTParameters {
  pInit: number;
  pTransit: number;
  pSlip: number;
  pGuess: number;
}

export const DEFAULT_BKT_PARAMS: BKTParameters = {
  pInit: 0.1,
  pTransit: 0.15,
  pSlip: 0.1,
  pGuess: 0.2,
};

/**
  Validates that a probability value lies within the closed interval [0, 1].
 */
export function validateProbability(value: number, paramName: string): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(
      `Invalid probability value for ${paramName}: ${value}. Must be between 0 and 1.`
    );
  }
}

/**
  Validates all BKT parameters.
 */
export function validateBKTParams(params: BKTParameters): void {
  validateProbability(params.pInit, 'pInit');
  validateProbability(params.pTransit, 'pTransit');
  validateProbability(params.pSlip, 'pSlip');
  validateProbability(params.pGuess, 'pGuess');
}

/**
  Calculates posterior probability P(L_t-1 | Observation).
 */
export function calculatePosterior(
  priorPL: number,
  isCorrect: boolean,
  params: BKTParameters = DEFAULT_BKT_PARAMS
): number {
  validateProbability(priorPL, 'priorPL');
  validateBKTParams(params);

  const { pSlip, pGuess } = params;

  if (isCorrect) {
    const numerator = priorPL * (1 - pSlip);
    const denominator = priorPL * (1 - pSlip) + (1 - priorPL) * pGuess;
    if (denominator === 0) return 1;
    return numerator / denominator;
  } else {
    const numerator = priorPL * pSlip;
    const denominator = priorPL * pSlip + (1 - priorPL) * (1 - pGuess);
    if (denominator === 0) return 0;
    return numerator / denominator;
  }
}

/**
  Updates student mastery probability P(L_t) using standard BKT update equations.
  
  P(L_t) = P(L_t-1 | Obs) + (1 - P(L_t-1 | Obs)) * pTransit
 */
export function updateMastery(
  priorPL: number,
  isCorrect: boolean,
  params: BKTParameters = DEFAULT_BKT_PARAMS
): number {
  const posterior = calculatePosterior(priorPL, isCorrect, params);
  const updatedPL = posterior + (1 - posterior) * params.pTransit;

  // Clamp numerical results to safe bounds [0.0001, 0.9999]
  return Math.min(Math.max(updatedPL, 0.0001), 0.9999);
}
