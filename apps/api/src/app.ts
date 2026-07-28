import Fastify from 'fastify';
import cors from '@fastify/cors';
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
  const app = Fastify({ logger: false });

  // 1. Security Headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options)
  app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
    crossOriginEmbedderPolicy: false,
  });

  // 2. CORS Configuration (Restrict allowed origins)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];

  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin) or matching whitelist
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
  app.setErrorHandler((error: any, _request, reply) => {
    console.error('API Error:', error);

    const statusCode = error.statusCode || 500;
    const isDev = process.env.NODE_ENV === 'development';

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
