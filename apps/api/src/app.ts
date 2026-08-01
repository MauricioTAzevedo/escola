import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { authRoutes } from './routes/auth';
import { subjectRoutes } from './routes/subjects';
import { kcRoutes } from './routes/kcs';
import { questionRoutes } from './routes/questions';
import { aiRoutes } from './routes/ai';
import { teacherRoutes } from './routes/teacher';
import { adminRoutes } from './routes/admin';

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: process.env.LOG_LEVEL || 'info' },
    // Trust the X-Forwarded-For header only when deployed behind a reverse proxy (Vercel etc.)
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // 1. Security Headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Cookie parsing for HttpOnly refresh token
  app.register(cookie);

  // 2. CORS Configuration (Restrict allowed origins)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];

  const hasCredentials = (request: any): boolean =>
    Boolean(
      request.headers?.authorization ||
        /(?:^|;\s*)refresh_token=/.test(request.headers?.cookie || '')
    );

  // Browsers always send Origin on cross-origin requests, so a missing origin is a
  // non-browser client (curl, mobile). Credentialed access from such clients is
  // rejected unless the origin is explicitly whitelisted (checked before CORS runs).
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers?.origin;
    if (hasCredentials(request) && !(origin && allowedOrigins.includes(origin))) {
      return reply.status(403).send({ error: 'Origem não permitida por CORS' });
    }
  });

  app.register(cors, {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow: string | boolean | RegExp) => void
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('Origem não permitida por CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 3. Global Rate Limiting (Prevent API abuse / DoS)
  app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: 'Muitas requisições. Por favor, tente novamente em breve.',
      statusCode: 429,
      expiresIn: Math.ceil(context.ttl / 1000),
    }),
  });

  // Register routes
  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(subjectRoutes, { prefix: '/api/subjects' });
  app.register(kcRoutes, { prefix: '/api/kcs' });
  app.register(questionRoutes, { prefix: '/api/questions' });
  app.register(aiRoutes, { prefix: '/api/ai' });
  app.register(teacherRoutes, { prefix: '/api/teacher' });
  app.register(adminRoutes, { prefix: '/api/admin' });

  app.get('/health', async () => {
    return { status: 'ok', service: 'Adaptive Tutoring API', version: '1.0.0' };
  });

  // 4. Secure Error Handler (Sanitize internal details & stack traces)
  app.setErrorHandler((error: any, request, reply) => {
    request.log.error(error, 'API Error');

    const statusCode = error.statusCode || 500;
    const isDev = process.env.NODE_ENV === 'development';

    if (error.message === 'Origem não permitida por CORS') {
      return reply.status(403).send({ error: 'Origem não permitida por CORS' });
    }

    const response: Record<string, any> = {
      error:
        statusCode >= 500 && !isDev
          ? 'Erro interno do servidor'
          : error.message || 'Erro na requisição',
    };

    if (isDev) {
      response.stack = error.stack;
    }

    reply.status(statusCode).send(response);
  });

  return app;
}
