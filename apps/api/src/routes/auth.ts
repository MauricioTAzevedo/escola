import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { generateTokens, verifyRefreshToken, authenticate } from '../plugins/auth';

const RegisterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z
    .string()
    .email('E-mail inválido')
    .transform((val) => val.toLowerCase().trim()),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  role: z.string().optional().transform(() => 'STUDENT' as const),
});

const LoginSchema = z.object({
  email: z
    .string()
    .email('E-mail inválido')
    .transform((val) => val.toLowerCase().trim()),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token é obrigatório'),
});

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Dados inválidos',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, role } = parseResult.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(409).send({ error: 'Já existe um usuário cadastrado com este e-mail' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
      },
    });

    // Auto-enroll student into existing subjects
    if (role === 'STUDENT') {
      const subjects = await prisma.subject.findMany();
      if (subjects.length > 0) {
        await prisma.classEnrollment.createMany({
          data: subjects.map((sub: { id: string }) => ({ studentId: user.id, subjectId: sub.id })),
        });
      }
    }

    const userPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN',
    };

    const tokens = generateTokens(userPayload);

    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (tokenErr) {
      request.log.error(tokenErr, 'Falha ao armazenar refresh token no banco');
    }

    return reply.status(201).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      tokens,
    });
  });

  // POST /api/auth/login
  fastify.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = LoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Dados inválidos',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { email, password } = parseResult.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({ error: 'E-mail ou senha incorretos' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return reply.status(401).send({ error: 'E-mail ou senha incorretos' });
      }

      const userPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN',
      };

      const tokens = generateTokens(userPayload);

    try {
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    } catch (tokenErr) {
      request.log.error(tokenErr, 'Falha ao armazenar refresh token no banco');
    }

      return reply.send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        },
        tokens,
      });
    }
  );

  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const parseResult = RefreshSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Refresh token é obrigatório' });
    }

    try {
      const token = parseResult.data.refreshToken;
      const { userId } = verifyRefreshToken(token);
      const tokenHash = hashToken(token);

      const existingRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!existingRecord) {
        return reply.status(401).send({ error: 'Refresh token não reconhecido' });
      }

      // Reuse detection: if token was already revoked, invalidate all sessions of the user
      if (existingRecord.revokedAt !== null) {
        await prisma.refreshToken.updateMany({
          where: { userId },
          data: { revokedAt: new Date() },
        });
        return reply.status(401).send({ error: 'Violação de segurança detectada. Sessão revogada.' });
      }

      if (existingRecord.expiresAt < new Date()) {
        return reply.status(401).send({ error: 'Refresh token expirado' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return reply.status(401).send({ error: 'Usuário não encontrado' });
      }

      // Revoke current refresh token
      await prisma.refreshToken.update({
        where: { id: existingRecord.id },
        data: { revokedAt: new Date() },
      });

      const userPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN',
      };

      const tokens = generateTokens(userPayload);

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return reply.send({ tokens });
    } catch (err) {
      return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const parseResult = RefreshSchema.safeParse(request.body);
    if (parseResult.success) {
      const tokenHash = hashToken(parseResult.data.refreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return reply.send({ message: 'Sessão encerrada com sucesso' });
  });

  // POST /api/auth/revoke-all
  fastify.post('/revoke-all', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }

    await prisma.refreshToken.updateMany({
      where: { userId: request.user.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return reply.send({ message: 'Todas as sessões ativas foram revogadas' });
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    return reply.send({ user });
  });
}
