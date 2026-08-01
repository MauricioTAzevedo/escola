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

export const formatDifficulty = (diff?: string): string => {
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
};

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
  imageUrl?: string;
  kcName?: string;
  isAiGenerated?: boolean;
  isApproved?: boolean;
}

