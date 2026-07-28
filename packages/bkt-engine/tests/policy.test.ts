import { describe, it, expect } from 'vitest';
import { AdaptivePolicy, RandomPolicy, CandidateQuestion, StudentKCState } from '../src';

describe('Adaptive & Random Question Selection Policies', () => {
  const mockCandidates: CandidateQuestion[] = [
    { id: 'q1', kcId: 'kc-low', difficulty: 'EASY' },
    { id: 'q2', kcId: 'kc-struggle', difficulty: 'MEDIUM' },
    { id: 'q3', kcId: 'kc-mastered', difficulty: 'HARD' },
  ];

  const mockMasteries: StudentKCState[] = [
    { kcId: 'kc-low', pMastery: 0.15 },
    { kcId: 'kc-struggle', pMastery: 0.55 }, // Productive struggle band: 0.40 - 0.70
    { kcId: 'kc-mastered', pMastery: 0.9 },
  ];

  it('AdaptivePolicy prioritizes questions in the productive struggle band', () => {
    const policy = new AdaptivePolicy();
    // Disable spaced repetition for deterministic test
    const selected = policy.selectNextQuestion(mockCandidates, mockMasteries, {
      spacedRepetitionProbability: 0,
    });

    expect(selected).not.toBeNull();
    expect(selected?.id).toBe('q2');
    expect(selected?.kcId).toBe('kc-struggle');
  });

  it('AdaptivePolicy excludes recently answered questions', () => {
    const policy = new AdaptivePolicy();
    const selected = policy.selectNextQuestion(mockCandidates, mockMasteries, {
      recentlyAnsweredIds: ['q2'], // Exclude productive struggle question
      spacedRepetitionProbability: 0,
    });

    expect(selected).not.toBeNull();
    expect(selected?.id).toBe('q1'); // Falls back to needsLearning (q1)
  });

  it('AdaptivePolicy falls back to full candidate list if all were recently answered', () => {
    const policy = new AdaptivePolicy();
    const selected = policy.selectNextQuestion(mockCandidates, mockMasteries, {
      recentlyAnsweredIds: ['q1', 'q2', 'q3'],
      spacedRepetitionProbability: 0,
    });

    expect(selected).not.toBeNull();
    expect(['q1', 'q2', 'q3']).toContain(selected?.id);
  });

  it('RandomPolicy returns a question from candidates', () => {
    const policy = new RandomPolicy();
    const selected = policy.selectNextQuestion(mockCandidates, mockMasteries);
    expect(selected).not.toBeNull();
    expect(mockCandidates.map((c) => c.id)).toContain(selected?.id);
  });

  it('returns null when candidates list is empty', () => {
    const policy = new AdaptivePolicy();
    expect(policy.selectNextQuestion([], mockMasteries)).toBeNull();
  });
});
