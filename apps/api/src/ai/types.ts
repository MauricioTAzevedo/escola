import { z } from 'zod';

export const AiExplanationResponseSchema = z.object({
  explanation: z.string().min(5),
  keyTakeaway: z.string().optional(),
});

export const AiFeedbackResponseSchema = z.object({
  message: z.string().min(5),
  suggestedFocus: z.string().optional(),
});

export const DraftQuestionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const DraftQuestionSchema = z.object({
  statement: z.string().min(5),
  type: z.enum(['MULTIPLE_CHOICE', 'OPEN_TEXT']).default('MULTIPLE_CHOICE'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  options: z.array(DraftQuestionOptionSchema).optional(),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const DraftQuestionListSchema = z.object({
  questions: z.array(DraftQuestionSchema),
});

export type AiExplanationResponse = z.infer<typeof AiExplanationResponseSchema>;
export type AiFeedbackResponse = z.infer<typeof AiFeedbackResponseSchema>;
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>;

export interface IAiTutorService {
  generateExplanation(
    questionStatement: string,
    studentAnswer: string,
    correctAnswer: string,
    kcName: string,
    currentPL: number
  ): Promise<string>;

  generateStudyFeedback(masteries: Array<{ kcName: string; pMastery: number }>): Promise<string>;

  generateQuestionsFromContent(
    rawText: string,
    kcName: string,
    difficulty: string,
    count: number
  ): Promise<DraftQuestion[]>;
}
