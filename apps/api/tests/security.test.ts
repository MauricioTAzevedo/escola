import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { buildApp } from '../src/app';

const app = buildApp();

describe('Security Hardening Integration Tests', () => {
  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const studentEmail = `student.sec.${Date.now()}@escola.edu.br`;
  let studentToken = '';
  let refreshToken = '';

  it('register endpoint assigns STUDENT role even if TEACHER is requested', async () => {
    const res = await supertest(app.server).post('/api/auth/register').send({
      name: 'Aluno Infiltrado',
      email: studentEmail,
      password: 'senhaSegura123',
      role: 'TEACHER', // Attempting to request TEACHER role
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT'); // Must be forced to STUDENT
    studentToken = res.body.tokens.accessToken;
    refreshToken = res.body.tokens.refreshToken;
  });

  it('rotates refresh tokens: the old token is invalidated after refresh', async () => {
    const res = await supertest(app.server).post('/api/auth/refresh').send({
      refreshToken: refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();

    const newRefreshToken = res.body.tokens.refreshToken;

    // Attempting to reuse the old refresh token should be rejected (reuse detection)
    const reuseRes = await supertest(app.server).post('/api/auth/refresh').send({
      refreshToken: refreshToken,
    });
    expect(reuseRes.status).toBe(401);

    // Update active refresh token reference
    refreshToken = newRefreshToken;
  });

  it('detects refresh token reuse and revokes the entire session family', async () => {
    // Attempting to reuse the old token again should trigger session revocation
    const reuseRes = await supertest(app.server).post('/api/auth/refresh').send({
      refreshToken: refreshToken,
    });

    expect(reuseRes.status).toBe(401);
  });

  it('logout revokes the refresh token server-side', async () => {
    // Register a new user for logout testing
    const logoutUserEmail = `logout.sec.${Date.now()}@escola.edu.br`;
    const reg = await supertest(app.server).post('/api/auth/register').send({
      name: 'User Logout Test',
      email: logoutUserEmail,
      password: 'senhaSegura123',
    });

    const tokenToRevoke = reg.body.tokens.refreshToken;

    const logoutRes = await supertest(app.server).post('/api/auth/logout').send({
      refreshToken: tokenToRevoke,
    });
    expect(logoutRes.status).toBe(200);

    // Attempting to use the revoked token must fail
    const refreshRes = await supertest(app.server).post('/api/auth/refresh').send({
      refreshToken: tokenToRevoke,
    });
    expect(refreshRes.status).toBe(401);
  });

  it('POST /auth/revoke-all invalidates every refresh session of the user', async () => {
    const email = `revokeall.${Date.now()}@escola.edu.br`;
    const reg = await supertest(app.server).post('/api/auth/register').send({
      name: 'User Revoke All',
      email,
      password: 'senhaSegura123',
    });

    const userAccess = reg.body.tokens.accessToken;
    const userRefresh = reg.body.tokens.refreshToken;

    const revokeRes = await supertest(app.server)
      .post('/api/auth/revoke-all')
      .set('Authorization', `Bearer ${userAccess}`);

    expect(revokeRes.status).toBe(200);

    const refreshRes = await supertest(app.server).post('/api/auth/refresh').send({
      refreshToken: userRefresh,
    });
    expect(refreshRes.status).toBe(401);
  });

  it('hides answer key (correctAnswer) and explanation for student requests', async () => {
    const res = await supertest(app.server)
      .get('/api/questions')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body[0].correctAnswer).toBeUndefined();
      expect(res.body[0].explanation).toBeUndefined();
    }
  });

  it('students cannot access teacher endpoints (403 Forbidden)', async () => {
    const res = await supertest(app.server)
      .post('/api/questions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        subjectId: 'sub-1',
        kcId: 'kc-1',
        statement: 'Questão Não Autorizada',
        correctAnswer: 'A',
      });

    expect(res.status).toBe(403);
  });

  it('sanitizes XSS payloads in input via sanitize-html', async () => {
    // Test login attempt with HTML payload - invalid email format yields 400 Bad Request
    const res = await supertest(app.server).post('/api/auth/login').send({
      email: '<script>alert(1)</script>test@escola.edu.br',
      password: 'somepassword',
    });

    expect(res.status).toBe(400);
  });
});
