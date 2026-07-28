import Fastify from 'fastify';
import { authRoutes } from './routes/auth';
import { subjectRoutes } from './routes/subjects';
import { kcRoutes } from './routes/kcs';
import { questionRoutes } from './routes/questions';
import { aiRoutes } from './routes/ai';
import { teacherRoutes } from './routes/teacher';
import { adminRoutes } from './routes/admin';

export function buildApp() {
  const app = Fastify({ logger: false });

  // CORS Hook for production cross-origin requests
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (request.method === 'OPTIONS') {
      reply.status(200).send();
    }
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

  app.setErrorHandler((error: any, _request, reply) => {
    console.error('API Error:', error);
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Erro interno do servidor',
      stack: error.stack,
    });
  });

  return app;
}
