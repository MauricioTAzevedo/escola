export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: UserDto;
  tokens: AuthTokens;
}

export interface SubjectDto {
  id: string;
  name: string;
  description: string;
  teacherId?: string;
  kcCount?: number;
  questionCount?: number;
  studentCount?: number;
  createdAt: string;
}

export interface KnowledgeComponentDto {
  id: string;
  subjectId: string;
  name: string;
  description: string;
  defaultPInit: number;
  defaultPTransit: number;
  defaultPSlip: number;
  defaultPGuess: number;
  _count?: { questions: number };
}

export type QuestionType = 'MULTIPLE_CHOICE' | 'OPEN_TEXT';
export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

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

export interface QuestionOptionDto {
  id: string;
  text: string;
}

export interface QuestionDto {
  id: string;
  subjectId: string;
  kcId: string;
  statement: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  options?: QuestionOptionDto[];
  correctAnswer?: string;
  explanation?: string;
  kcName?: string;
  isAiGenerated?: boolean;
  isApproved?: boolean;
}

export interface SubmitAnswerPayload {
  questionId: string;
  selectedOptionId?: string;
  textAnswer?: string;
}

export interface SubmitAnswerResponse {
  attemptId: string;
  isCorrect: boolean;
  correctAnswerText: string;
  previousPL: number;
  newPL: number;
  aiExplanation?: string;
  aiFeedback?: string;
}

export interface StudentMasteryDto {
  kcId: string;
  kcName: string;
  subjectName?: string;
  pMastery: number;
  totalAttempts: number;
  correctAttempts: number;
  lastUpdated: string;
}

export interface FlaggedStudentDto {
  studentId: string;
  studentName: string;
  kcId: string;
  kcName: string;
  pMastery: number;
  attemptsCount: number;
  reason: 'low_mastery_high_attempts' | 'inactive';
}
