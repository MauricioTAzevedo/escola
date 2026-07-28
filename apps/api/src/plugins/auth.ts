import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';

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

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET and JWT_REFRESH_SECRET environment variables must be configured in production.');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-this-in-production-min-32-chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-jwt-refresh-key-change-this-in-production';


export function generateTokens(payload: UserPayload) {
  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { userId: payload.userId, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token: string): { userId: string } {
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; type: string };
  if (decoded.type !== 'refresh') {
    throw new Error('Token de atualização inválido');
  }
  return { userId: decoded.userId };
}

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload & { type: string };

    if (decoded.type !== 'access') {
      return reply.status(401).send({ error: 'Token inválido' });
    }

    request.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
  } catch (err) {
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

export default fp(async (_fastify: FastifyInstance) => {
  // Plugin registration hook if needed
});
