export function formatDifficulty(diff?: string): string {
  switch (diff) {
    case 'EASY':
      return 'Fácil';
    case 'MEDIUM':
      return 'Médio';
    case 'HARD':
      return 'Difícil';
    default:
      return diff || 'Médio';
  }
}
