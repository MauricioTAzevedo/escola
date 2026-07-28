import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { generateTokens, verifyRefreshToken, authenticate } from '../plugins/auth';

const RegisterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z
    .string()
    .email('E-mail inválido')
    .transform((val) => val.toLowerCase().trim()),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']).default('STUDENT'),
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
          data: subjects.map((sub) => ({ studentId: user.id, subjectId: sub.id })),
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
      const { userId } = verifyRefreshToken(parseResult.data.refreshToken);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.status(401).send({ error: 'Usuário não encontrado' });
      }

      const userPayload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN',
      };

      const tokens = generateTokens(userPayload);
      return reply.send({ tokens });
    } catch (err) {
      return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ message: 'Sessão encerrada com sucesso' });
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
