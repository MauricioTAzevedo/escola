import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../src/app';

const app = buildApp();

describe('Auth API Integration Tests', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = `test.user.${Date.now()}@escola.edu.br`;
  let accessToken = '';

  it('POST /api/auth/register registers a new student and returns JWT tokens', async () => {
    const res = await supertest(app.server).post('/api/auth/register').send({
      name: 'Aluno Teste',
      email: testEmail,
      password: 'senhaSegura123',
      role: 'STUDENT',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.tokens.accessToken).toBeDefined();

    accessToken = res.body.tokens.accessToken;
  });

  it('POST /api/auth/login authenticates with valid credentials', async () => {
    const res = await supertest(app.server).post('/api/auth/login').send({
      email: testEmail,
      password: 'senhaSegura123',
    });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeDefined();
  });

  it('GET /api/auth/me returns current user profile when token is valid', async () => {
    const res = await supertest(app.server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testEmail);
  });

  it('POST /api/auth/login fails with invalid credentials', async () => {
    const res = await supertest(app.server).post('/api/auth/login').send({
      email: testEmail,
      password: 'senhaErrada123',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});
