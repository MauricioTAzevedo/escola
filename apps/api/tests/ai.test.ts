import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../src/app';
import { MockAiTutorService } from '../src/ai/MockAiTutorService';
import { RateLimiter } from '../src/ai/RateLimiter';
import { AiExplanationResponseSchema } from '../src/ai/types';

const app = buildApp();

describe('AI Tutor Service & Cache/Rate-Limiter Tests', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('MockAiTutorService generates valid pt-BR explanation and increments counter', async () => {
    const mock = new MockAiTutorService();
    const explanation = await mock.generateExplanation(
      'O que é float em Python?',
      'Número inteiro',
      'float',
      'Variáveis e Tipos de Dados',
      0.45
    );

    expect(explanation).toContain('Variáveis e Tipos de Dados');
    expect(mock.explanationCallsCount).toBe(1);
  });

  it('Validates AI explanation JSON structure with Zod schema', () => {
    const validJson = {
      explanation: 'A resposta correta é float porque 3.14 possui casas decimais.',
      keyTakeaway: 'Floats representam números reais.',
    };

    const parsed = AiExplanationResponseSchema.safeParse(validJson);
    expect(parsed.success).toBe(true);

    const invalidJson = { explanation: 123 };
    expect(AiExplanationResponseSchema.safeParse(invalidJson).success).toBe(false);
  });

  it('RateLimiter enforces maximum requests within window', () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false); // 4th request rejected
  });

  it('POST /api/ai/generate-questions returns unapproved draft questions for teacher review', async () => {
    // Login as teacher
    const loginRes = await supertest(app.server)
      .post('/api/auth/login')
      .send({
        email: 'prof.carlos@escola.edu.br',
        password: 'senha123',
      });

    const teacherToken = loginRes.body.tokens.accessToken;

    const res = await supertest(app.server)
      .post('/api/ai/generate-questions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        rawText: 'Python possui tipos de dados primitivos como int, float, str e bool. Listas são mutáveis e tuplas são imutáveis.',
        kcName: 'Variáveis e Tipos de Dados',
        difficulty: 'MEDIUM',
        count: 2,
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.draftQuestions)).toBe(true);
    expect(res.body.draftQuestions.length).toBe(2);
    expect(res.body.draftQuestions[0].isApproved).toBe(false); // Safety check: draft questions must be unapproved!
  });
});
