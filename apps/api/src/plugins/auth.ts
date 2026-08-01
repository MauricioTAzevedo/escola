import { FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export interface UserPayload {
  userId: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserPayload;
  }
}

const KNOWN_DEFAULT_SECRETS = new Set([
  'super-secret-jwt-key-change-this-in-production-min-32-chars',
  'super-secret-jwt-refresh-key-change-this-in-production',
  'dev-only-secret-key-do-not-use-in-prod-min-32-chars',
  'dev-only-refresh-secret-key-do-not-use-in-prod',
  'generate-a-random-64-hex-char-secret',
  'generate-a-different-random-64-hex-char-secret',
]);

function loadSecret(raw: string | undefined, name: string): string {
  if (raw && raw.length >= 32 && !KNOWN_DEFAULT_SECRETS.has(raw)) {
    return raw;
  }
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction || raw) {
    throw new Error(
      `FATAL SECURITY ERROR: ${name} must be set, be at least 32 characters long, and not be a known default value.`
    );
  }
  return crypto.randomBytes(32).toString('hex');
}

const ACCESS_SECRET = loadSecret(process.env.JWT_SECRET, 'JWT_SECRET');
// Refresh tokens are opaque + SHA-256 hashed (no JWT), but we still fail closed
// if a weak JWT_REFRESH_SECRET is left configured in the environment.
loadSecret(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET');

const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const REFRESH_COOKIE_NAME = 'refresh_token';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  // Dev: web and API share the localhost site. Prod: API is a separate origin,
  // so the cookie must be sent cross-site (requires Secure, which is enforced above).
  sameSite: (IS_PRODUCTION ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_MS / 1000,
};

export function generateAccessToken(payload: UserPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export async function createRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

export async function verifyRefreshToken(raw: string): Promise<{ userId: string }> {
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    throw new Error('Refresh token inválido');
  }

  if (stored.revokedAt) {
    await revokeAllUserRefreshTokens(stored.userId);
    throw new Error('Refresh token reutilizado; todas as sessões foram revogadas');
  }

  if (stored.expiresAt.getTime() < Date.now()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new Error('Refresh token expirado');
  }

  return { userId: stored.userId };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function setRefreshCookie(reply: FastifyReply, raw: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, raw, REFRESH_COOKIE_OPTIONS);
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, ACCESS_SECRET, {
      algorithms: ['HS256'],
    }) as UserPayload & { type: string };

    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: 'Token inválido' });
    }

    request.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch {
    return reply.status(401).send({ error: 'Sessão expirada ou token inválido' });
  }
};

export const requireRole = (allowedRoles: ('STUDENT' | 'TEACHER' | 'ADMIN')[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Acesso negado. Permissão insuficiente.' });
    }
  };
};

export default fp(async () => {
  // Plugin registration hook if needed
});
