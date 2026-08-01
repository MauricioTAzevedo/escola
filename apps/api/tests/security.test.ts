import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = buildApp();

const unique = Date.now();
const teacherBEmail = `sec.teacher.${unique}@escola.edu.br`;

let teacherToken = '';
let teacherBToken = '';
let viewerStudentId = '';
let viewerStudentToken = '';
let seededSubjectId = '';
let seededKcId = '';
let seededQuestionId = '';

async function registerStudent(prefix: string) {
  const email = `sec.${prefix}.${unique}@escola.edu.br`;
  const res = await supertest(app.server).post('/api/auth/register').send({
    name: 'Aluno Seguranca',
    email,
    password: 'senhaSegura123',
  });
  return { email, res };
}

async function loginAs(email: string, password: string) {
  return supertest(app.server).post('/api/auth/login').send({ email, password });
}

describe('Security Hardening Integration Tests', () => {
  beforeAll(async () => {
    await app.ready();

    // Teacher A (seeded by prisma/seed.ts)
    const loginA = await loginAs('prof.carlos@escola.edu.br', 'senha123');
    teacherToken = loginA.body.tokens.accessToken;

    const subject = await prisma.subject.findFirst();
    seededSubjectId = subject!.id;
    const kc = await prisma.knowledgeComponent.findFirst({
      where: { subjectId: seededSubjectId },
    });
    seededKcId = kc!.id;
    const question = await prisma.question.findFirst({ where: { kcId: seededKcId } });
    seededQuestionId = question!.id;

    // Teacher B: teachers have no self-registration path; create directly in DB
    const hash = await bcrypt.hash('outraSenha123', 10);
    await prisma.user.create({
      data: { name: 'Professora B', email: teacherBEmail, passwordHash: hash, role: 'TEACHER' },
    });
    const loginB = await loginAs(teacherBEmail, 'outraSenha123');
    teacherBToken = loginB.body.tokens.accessToken;

    // Shared student viewer (enrolled in Teacher A's subject)
    const { res } = await registerStudent('viewer');
    viewerStudentId = res.body.user.id;
    viewerStudentToken = res.body.tokens.accessToken;
    await prisma.classEnrollment.create({
      data: { studentId: viewerStudentId, subjectId: seededSubjectId },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects privilege escalation: register with role TEACHER always creates a STUDENT', async () => {
    const res = await supertest(app.server).post('/api/auth/register').send({
      name: 'Tentativa de Professor',
      email: `sec.escalate.${unique}@escola.edu.br`,
      password: 'senhaSegura123',
      role: 'TEACHER',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('rejects register with weak password (missing digit)', async () => {
    const res = await supertest(app.server).post('/api/auth/register').send({
      name: 'Aluno Fraco',
      email: `sec.weak.${unique}@escola.edu.br`,
      password: 'apenasletras',
    });
    expect(res.status).toBe(400);
  });

  it('rotates refresh tokens: the old token is invalidated after refresh', async () => {
    const { email } = await registerStudent('rotate');
    const login = await loginAs(email, 'senhaSegura123');
    const oldToken = login.body.tokens.refreshToken;

    const refreshed = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.tokens.refreshToken).toBeDefined();

    const reused = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldToken });
    expect(reused.status).toBe(401);
  });

  it('detects refresh token reuse and revokes the entire session family', async () => {
    const { email } = await registerStudent('reuse');
    const login = await loginAs(email, 'senhaSegura123');
    const tokenA = login.body.tokens.refreshToken;

    const rotated = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenA });
    expect(rotated.status).toBe(200);
    const tokenB = rotated.body.tokens.refreshToken;

    // Reuse of A is an active theft signal → all tokens for the user die
    const reuseAttack = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenA });
    expect(reuseAttack.status).toBe(401);

    const stillCurrent = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: tokenB });
    expect(stillCurrent.status).toBe(401);
  });

  it('logout revokes the refresh token server-side', async () => {
    const { email } = await registerStudent('logout');
    const login = await loginAs(email, 'senhaSegura123');
    const refreshToken = login.body.tokens.refreshToken;

    const logout = await supertest(app.server)
      .post('/api/auth/logout')
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    const refresh = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('POST /auth/revoke-all invalidates every refresh session of the user', async () => {
    const { email } = await registerStudent('revokeall');
    const login = await loginAs(email, 'senhaSegura123');
    const refreshToken = login.body.tokens.refreshToken;

    const revoke = await supertest(app.server)
      .post('/api/auth/revoke-all')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`);
    expect(revoke.status).toBe(200);

    const refresh = await supertest(app.server)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('STUDENT cannot create questions', async () => {
    const res = await supertest(app.server)
      .post('/api/questions')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${viewerStudentToken}`)
      .send({
        subjectId: seededSubjectId,
        kcId: seededKcId,
        statement: 'Questão maliciosa?',
        difficulty: 'EASY',
        correctAnswer: 'opt1',
      });
    expect(res.status).toBe(403);
  });

  it('STUDENT sees approved questions without answers, unapproved questions are hidden', async () => {
    const unapproved = await prisma.question.create({
      data: {
        subjectId: seededSubjectId,
        kcId: seededKcId,
        statement: 'Rascunho sem aprovação',
        type: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        correctAnswer: 'opt1',
        optionsJson: JSON.stringify([
          { id: 'opt1', text: 'A' },
          { id: 'opt2', text: 'B' },
        ]),
        isApproved: false,
        isAiGenerated: true,
      },
    });

    const hidden = await supertest(app.server)
      .get(`/api/questions/${unapproved.id}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${viewerStudentToken}`);
    expect(hidden.status).toBe(403);

    const visible = await supertest(app.server)
      .get(`/api/questions/${seededQuestionId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${viewerStudentToken}`);
    expect(visible.status).toBe(200);
    expect(visible.body.correctAnswer).toBeUndefined();
    expect(visible.body.explanation).toBeUndefined();
  });

  it('enforces teacher ownership: 403 across teachers, 404 for missing resources', async () => {
    const kcList = await supertest(app.server)
      .get(`/api/kcs?subjectId=${seededSubjectId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(kcList.status).toBe(403);

    const kcRead = await supertest(app.server)
      .put(`/api/kcs/${seededKcId}`)
      .send({ name: 'Tentativa de edição' })
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(kcRead.status).toBe(403);

    const questionRead = await supertest(app.server)
      .get(`/api/questions/${seededQuestionId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(questionRead.status).toBe(403);

    const missing = await supertest(app.server)
      .put(`/api/kcs/${randomUUID()}`)
      .send({ name: 'KC Inexistente' })
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(missing.status).toBe(404);
  });

  it('approve flow: only the owning teacher can approve a draft', async () => {
    const draft = await prisma.question.create({
      data: {
        subjectId: seededSubjectId,
        kcId: seededKcId,
        statement: 'Rascunho para aprovação',
        type: 'MULTIPLE_CHOICE',
        difficulty: 'MEDIUM',
        correctAnswer: 'opt1',
        optionsJson: JSON.stringify([{ id: 'opt1', text: 'A' }]),
        isApproved: false,
        isAiGenerated: true,
      },
    });

    const crossApprove = await supertest(app.server)
      .post(`/api/questions/${draft.id}/approve`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(crossApprove.status).toBe(403);

    const approve = await supertest(app.server)
      .post(`/api/questions/${draft.id}/approve`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.isApproved).toBe(true);
  });

  it('escapes CSV formula injection in export (OWASP)', async () => {
    await prisma.question.create({
      data: {
        subjectId: seededSubjectId,
        kcId: seededKcId,
        statement: '=SUM(A1:A9)',
        type: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        correctAnswer: 'opt1',
        isApproved: true,
      },
    });

    const csv = await supertest(app.server)
      .get(`/api/teacher/export-csv?subjectId=${seededSubjectId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("'=SUM(A1:A9)");

    const crossExport = await supertest(app.server)
      .get(`/api/teacher/export-csv?subjectId=${seededSubjectId}`)
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(crossExport.status).toBe(403);
  });
});
