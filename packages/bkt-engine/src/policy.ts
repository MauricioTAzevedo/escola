export interface CandidateQuestion {
  id: string;
  kcId: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | string;
}

export interface StudentKCState {
  kcId: string;
  pMastery: number;
}

export interface SelectionOptions {
  recentlyAnsweredIds?: string[];
  targetBandMin?: number; // Default 0.40
  targetBandMax?: number; // Default 0.70
  spacedRepetitionProbability?: number; // Default 0.15
}

export interface QuestionSelectionStrategy {
  selectNextQuestion(
    candidates: CandidateQuestion[],
    masteries: StudentKCState[],
    options?: SelectionOptions
  ): CandidateQuestion | null;
}

/**
  Adaptive Selection Policy implementing productive struggle & spaced repetition.
 */
export class AdaptivePolicy implements QuestionSelectionStrategy {
  selectNextQuestion(
    candidates: CandidateQuestion[],
    masteries: StudentKCState[],
    options: SelectionOptions = {}
  ): CandidateQuestion | null {
    if (!candidates || candidates.length === 0) return null;

    const {
      recentlyAnsweredIds = [],
      targetBandMin = 0.4,
      targetBandMax = 0.7,
      spacedRepetitionProbability = 0.15,
    } = options;

    // Filter out recently answered questions if possible
    let pool = candidates.filter((q) => !recentlyAnsweredIds.includes(q.id));
    if (pool.length === 0) {
      pool = [...candidates]; // Fallback to all candidates if all have been recently answered
    }

    // Map mastery levels by KC ID
    const masteryMap = new Map<string, number>();
    masteries.forEach((m) => masteryMap.set(m.kcId, m.pMastery));

    // Categorize pool into strategy buckets
    const productiveStruggle: CandidateQuestion[] = [];
    const needsLearning: CandidateQuestion[] = [];
    const masteredSpaced: CandidateQuestion[] = [];

    for (const q of pool) {
      const pL = masteryMap.get(q.kcId) ?? 0.1; // Default prior if unattempted

      if (pL >= targetBandMin && pL <= targetBandMax) {
        productiveStruggle.push(q);
      } else if (pL < targetBandMin) {
        needsLearning.push(q);
      } else {
        masteredSpaced.push(q);
      }
    }

    // Roll for spaced repetition if we have mastered questions available
    const shouldSpacedRepeat =
      masteredSpaced.length > 0 && Math.random() < spacedRepetitionProbability;

    if (shouldSpacedRepeat) {
      return pickRandom(masteredSpaced);
    }

    // 1. Prioritize productive struggle band (highest learning efficiency)
    if (productiveStruggle.length > 0) {
      return pickRandom(productiveStruggle);
    }

    // 2. Fallback to concepts that still need learning
    if (needsLearning.length > 0) {
      return pickRandom(needsLearning);
    }

    // 3. Fallback to mastered questions
    if (masteredSpaced.length > 0) {
      return pickRandom(masteredSpaced);
    }

    return pickRandom(pool);
  }
}

/**
  Random Selection Policy used for baseline comparison & testing.
 */
export class RandomPolicy implements QuestionSelectionStrategy {
  selectNextQuestion(
    candidates: CandidateQuestion[],
    _masteries: StudentKCState[],
    options: SelectionOptions = {}
  ): CandidateQuestion | null {
    if (!candidates || candidates.length === 0) return null;

    const recentlyAnswered = options.recentlyAnsweredIds ?? [];
    let pool = candidates.filter((q) => !recentlyAnswered.includes(q.id));
    if (pool.length === 0) {
      pool = [...candidates];
    }

    return pickRandom(pool);
  }
}

function pickRandom<T>(array: T[]): T {
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}
