import { describe, it, expect } from 'vitest';
import { updateMastery, validateProbability, DEFAULT_BKT_PARAMS } from '../src/bkt';

describe('BKT Core Equations & Parameter Validation', () => {
  it('validates probability values and throws on invalid inputs', () => {
    expect(() => validateProbability(-0.1, 'test')).toThrow();
    expect(() => validateProbability(1.2, 'test')).toThrow();
    expect(() => validateProbability(0.5, 'test')).not.toThrow();
  });

  it('increases mastery P(L) after a correct answer', () => {
    const prior = 0.3;
    const newPL = updateMastery(prior, true, DEFAULT_BKT_PARAMS);
    expect(newPL).toBeGreaterThan(prior);
  });

  it('decreases mastery P(L) after an incorrect answer', () => {
    const prior = 0.7;
    const newPL = updateMastery(prior, false, DEFAULT_BKT_PARAMS);
    expect(newPL).toBeLessThan(prior);
  });

  it('handles a streak of correct answers monotonically approaching high mastery', () => {
    let pL = 0.1;
    for (let i = 0; i < 5; i++) {
      const nextPL = updateMastery(pL, true, DEFAULT_BKT_PARAMS);
      expect(nextPL).toBeGreaterThan(pL);
      pL = nextPL;
    }
    expect(pL).toBeGreaterThan(0.9);
  });

  it('handles a streak of incorrect answers monotonically decreasing mastery', () => {
    let pL = 0.8;
    for (let i = 0; i < 5; i++) {
      const nextPL = updateMastery(pL, false, DEFAULT_BKT_PARAMS);
      expect(nextPL).toBeLessThan(pL);
      pL = nextPL;
    }
    expect(pL).toBeLessThan(0.3);
  });

  it('clamps output to safe range [0.0001, 0.9999]', () => {
    const high = updateMastery(0.99, true, {
      pInit: 0.1,
      pTransit: 0.5,
      pSlip: 0.01,
      pGuess: 0.01,
    });
    expect(high).toBeLessThanOrEqual(0.9999);

    const low = updateMastery(0.01, false, {
      pInit: 0.1,
      pTransit: 0.0001,
      pSlip: 0.5,
      pGuess: 0.5,
    });
    expect(low).toBeGreaterThanOrEqual(0.0001);
  });
});
