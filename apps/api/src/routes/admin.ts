import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { requireRole } from '../plugins/auth';

export async function adminRoutes(fastify: FastifyInstance) {
  // GET /api/admin/export-db (Download SQLite file backup - Admin only)
  fastify.get('/export-db', { preHandler: [requireRole(['ADMIN'])] }, async (_request, reply) => {
    const dbPath = path.resolve(process.cwd(), 'dev.db');

    if (!fs.existsSync(dbPath)) {
      return reply.status(404).send({ error: 'Arquivo de banco de dados não encontrado no servidor.' });
    }

    const stream = fs.createReadStream(dbPath);
    reply.header('Content-Type', 'application/x-sqlite3');
    reply.header('Content-Disposition', `attachment; filename="backup_escola_${Date.now()}.db"`);
    return reply.send(stream);
  });
}
