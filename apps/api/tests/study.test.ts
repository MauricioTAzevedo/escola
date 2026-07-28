import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../src/app';

const app = buildApp();

describe('Study Session & Adaptive Endpoint Tests', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  let token = '';

  beforeAll(async () => {
    const res = await supertest(app.server)
      .post('/api/auth/login')
      .send({
        email: 'aluno.lucas@escola.edu.br',
        password: 'senha123',
      });
    token = res.body.tokens.accessToken;
  });

  it('GET /api/subjects returns subject list for authenticated student', async () => {
    const res = await supertest(app.server)
      .get('/api/subjects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/study/next-question adaptively selects a question', async () => {
    const subjectsRes = await supertest(app.server)
      .get('/api/subjects')
      .set('Authorization', `Bearer ${token}`);

    const subjectId = subjectsRes.body[0].id;

    const res = await supertest(app.server)
      .get(`/api/study/next-question?subjectId=${subjectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.statement).toBeDefined();
    expect(res.body.correctAnswer).toBeUndefined(); // Security check: correctAnswer omitted
  });

  it('POST /api/study/answer records attempt and updates BKT mastery', async () => {
    const subjectsRes = await supertest(app.server)
      .get('/api/subjects')
      .set('Authorization', `Bearer ${token}`);

    const subjectId = subjectsRes.body[0].id;

    const qRes = await supertest(app.server)
      .get(`/api/study/next-question?subjectId=${subjectId}`)
      .set('Authorization', `Bearer ${token}`);

    const question = qRes.body;
    const selectedOpt = question.options ? question.options[0].id : undefined;

    const answerRes = await supertest(app.server)
      .post('/api/study/answer')
      .set('Authorization', `Bearer ${token}`)
      .send({
        questionId: question.id,
        selectedOptionId: selectedOpt,
      });

    expect(answerRes.status).toBe(200);
    expect(answerRes.body.attemptId).toBeDefined();
    expect(typeof answerRes.body.isCorrect).toBe('boolean');
    expect(typeof answerRes.body.newPL).toBe('number');
    expect(answerRes.body.aiExplanation).toBeDefined();
  });
});
