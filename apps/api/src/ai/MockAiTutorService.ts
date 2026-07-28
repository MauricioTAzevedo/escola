import { IAiTutorService, DraftQuestion } from './types';

export class MockAiTutorService implements IAiTutorService {
  public explanationCallsCount = 0;
  public feedbackCallsCount = 0;
  public questionGenCallsCount = 0;

  async generateExplanation(
    questionStatement: string,
    studentAnswer: string,
    correctAnswer: string,
    kcName: string,
    currentPL: number
  ): Promise<string> {
    this.explanationCallsCount++;
    return `[Mock AI] Análise para "${kcName}": A resposta enviada "${studentAnswer}" difere de "${correctAnswer}". Domínio atual: ${Math.round(currentPL * 100)}%.`;
  }

  async generateStudyFeedback(
    masteries: Array<{ kcName: string; pMastery: number }>
  ): Promise<string> {
    this.feedbackCallsCount++;
    return `[Mock AI] Ótimo progresso em ${masteries.length} componentes de conhecimento!`;
  }

  async generateQuestionsFromContent(
    _rawText: string,
    kcName: string,
    difficulty: string,
    count: number = 2
  ): Promise<DraftQuestion[]> {
    this.questionGenCallsCount++;
    const drafts: DraftQuestion[] = [];
    for (let i = 1; i <= count; i++) {
      drafts.push({
        statement: `[Draft ${i}] Questão rascunho de IA sobre ${kcName}?`,
        type: 'MULTIPLE_CHOICE',
        difficulty: (difficulty as any) || 'MEDIUM',
        options: [
          { id: 'opt1', text: 'Opção Correta Rascunho' },
          { id: 'opt2', text: 'Opção Incorreta A' },
          { id: 'opt3', text: 'Opção Incorreta B' },
          { id: 'opt4', text: 'Opção Incorreta C' },
        ],
        correctAnswer: 'opt1',
        explanation: 'Esta é uma questão gerada em rascunho pela IA.',
      });
    }
    return drafts;
  }
}
