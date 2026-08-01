import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { RateLimiter } from '../ai/RateLimiter';
import {
  generateAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  setRefreshCookie,
  clearRefreshCookie,
  authenticate,
  REFRESH_COOKIE_NAME,
} from '../plugins/auth';

const RegisterSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z
    .string()
    .email('E-mail inválido')
    .transform((val) => val.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .regex(/[a-zA-Z]/, 'Senha deve conter pelo menos uma letra')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número'),
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

function toUserPayload(user: { id: string; email: string; name: string; role: string }) {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'STUDENT' | 'TEACHER' | 'ADMIN',
  };
}

// Per-account login throttling (max 5 attempts / minute per email).
// Implemented in-handler (not via @fastify/rate-limit route config) because the
// plugin's keyGenerator runs at onRequest, before the body is parsed.
const loginLimiters = new Map<string, RateLimiter>();

function getLoginLimiter(email: string): RateLimiter {
  let limiter = loginLimiters.get(email);
  if (!limiter) {
    limiter = new RateLimiter(5, 60_000);
    loginLimiters.set(email, limiter);
  }
  return limiter;
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

    const { name, email, password } = parseResult.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(409).send({ error: 'Já existe um usuário cadastrado com este e-mail' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'STUDENT',
      },
    });

    const refreshToken = await createRefreshToken(user.id);
    const accessToken = generateAccessToken(toUserPayload(user));
    setRefreshCookie(reply, refreshToken);

    request.log.info({ userId: user.id, email }, 'user.registered');

    return reply.status(201).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: { accessToken, refreshToken },
    });
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Dados inválidos',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parseResult.data;

    const limiter = getLoginLimiter(email);
    if (!limiter.tryAcquire()) {
      return reply
        .status(429)
        .send({ error: 'Muitas tentativas de login. Tente novamente em 1 minuto.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        request.log.warn({ email }, 'auth.login_failed.user_not_found');
        return reply.status(401).send({ error: 'E-mail ou senha incorretos' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        request.log.warn({ userId: user.id, email }, 'auth.login_failed.wrong_password');
        return reply.status(401).send({ error: 'E-mail ou senha incorretos' });
      }

      const refreshToken = await createRefreshToken(user.id);
      const accessToken = generateAccessToken(toUserPayload(user));
      setRefreshCookie(reply, refreshToken);

      request.log.info({ userId: user.id, email }, 'user.login');

      return reply.send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        },
        tokens: { accessToken, refreshToken },
      });
    }
  );
  // POST /api/auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME];
    const bodyToken = RefreshSchema.safeParse(request.body).success
      ? (request.body as { refreshToken: string }).refreshToken
      : undefined;
    const rawToken = cookieToken || bodyToken;

    if (!rawToken) {
      return reply.status(400).send({ error: 'Refresh token é obrigatório' });
    }

    try {
      const { userId } = await verifyRefreshToken(rawToken);
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.status(401).send({ error: 'Usuário não encontrado' });
      }

      // Rotate: revoke the presented token and issue a new one
      await revokeRefreshToken(rawToken);
      const refreshToken = await createRefreshToken(user.id);
      const accessToken = generateAccessToken(toUserPayload(user));
      setRefreshCookie(reply, refreshToken);

      request.log.info({ userId: user.id }, 'auth.refresh.rotated');

      return reply.send({ tokens: { accessToken, refreshToken } });
    } catch {
      return reply.status(401).send({ error: 'Refresh token inválido ou expirado' });
    }
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (request, reply) => {
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME];
    const bodyToken = RefreshSchema.safeParse(request.body).success
      ? (request.body as { refreshToken: string }).refreshToken
      : undefined;

    const rawToken = cookieToken || bodyToken;
    if (rawToken) {
      await revokeRefreshToken(rawToken);
    }
    clearRefreshCookie(reply);

    request.log.info({ userId: request.user?.userId }, 'user.logout');
    return reply.send({ message: 'Sessão encerrada com sucesso' });
  });

  // POST /api/auth/revoke-all (invalidate every session for the current user)
  fastify.post('/revoke-all', { preHandler: [authenticate] }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Não autenticado' });
    }
    await revokeAllUserRefreshTokens(request.user.userId);
    clearRefreshCookie(reply);
    request.log.info({ userId: request.user.userId }, 'user.sessions_revoked');
    return reply.send({ message: 'Todas as sessões foram revogadas' });
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
