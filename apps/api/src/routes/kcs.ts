import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';

import { sanitizeString } from '../lib/sanitize';

const CreateKCSchema = z.object({
  subjectId: z.string().min(1, 'ID da disciplina é obrigatório'),
  name: z
    .string()
    .min(2, 'Nome do componente de conhecimento é obrigatório')
    .transform(sanitizeString),
  description: z.string().default('').transform(sanitizeString),
  defaultPInit: z.number().min(0).max(1).default(0.1),
  defaultPTransit: z.number().min(0).max(1).default(0.15),
  defaultPSlip: z.number().min(0).max(1).default(0.1),
  defaultPGuess: z.number().min(0).max(1).default(0.2),
});

const UpdateKCSchema = z.object({
  name: z
    .string()
    .min(2)
    .optional()
    .transform((v) => (v ? sanitizeString(v) : v)),
  description: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeString(v) : v)),
  defaultPInit: z.number().min(0).max(1).optional(),
  defaultPTransit: z.number().min(0).max(1).optional(),
  defaultPSlip: z.number().min(0).max(1).optional(),
  defaultPGuess: z.number().min(0).max(1).optional(),
});

async function ensureSubjectOwnership(
  request: any,
  reply: any,
  subjectId: string
): Promise<boolean> {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'Não autenticado' });
    return false;
  }
  if (user.role === 'ADMIN') {
    const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      reply.status(404).send({ error: 'Disciplina não encontrada' });
      return false;
    }
    return true;
  }

  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: user.userId },
  });
  if (!subject) {
    const exists = await prisma.subject.findUnique({ where: { id: subjectId } });
    if (!exists) {
      reply.status(404).send({ error: 'Disciplina não encontrada' });
      return false;
    }
    reply.status(403).send({ error: 'Acesso negado. Você não é o professor desta disciplina.' });
    return false;
  }
  return true;
}

async function getOwnedKc(request: any, reply: any, kcId: string) {
  const user = request.user;
  const where =
    user.role === 'ADMIN'
      ? { id: kcId }
      : {
          id: kcId,
          subject: { teacherId: user.userId },
        };
  const kc = await prisma.knowledgeComponent.findFirst({ where, include: { subject: true } });
  if (!kc) {
    const exists = await prisma.knowledgeComponent.findUnique({ where: { id: kcId } });
    reply
      .status(exists ? 403 : 404)
      .send({
        error: exists
          ? 'Acesso negado. Você não é o professor desta disciplina.'
          : 'Componente de conhecimento não encontrado',
      });
    return null;
  }
  return kc;
}

export async function kcRoutes(fastify: FastifyInstance) {
  // GET /api/kcs?subjectId=...
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { subjectId } = request.query as { subjectId?: string };
    const user = request.user;

    // STUDENT: only KCs of enrolled subjects. TEACHER: only their own subjects.
    let allowedSubjectIds: string[] | undefined;
    if (user && user.role === 'STUDENT') {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { studentId: user.userId },
        select: { subjectId: true },
      });
      allowedSubjectIds = enrollments.map((e) => e.subjectId);
      if (subjectId && !allowedSubjectIds.includes(subjectId)) {
        return reply.status(403).send({ error: 'Acesso negado. Você não está matriculado nesta disciplina.' });
      }
    } else if (user && user.role === 'TEACHER') {
      const subjects = await prisma.subject.findMany({
        where: { teacherId: user.userId },
        select: { id: true },
      });
      allowedSubjectIds = subjects.map((s) => s.id);
      if (subjectId && !allowedSubjectIds.includes(subjectId)) {
        return reply.status(403).send({ error: 'Acesso negado. Você não é o professor desta disciplina.' });
      }
    }

    const kcs = await prisma.knowledgeComponent.findMany({
      where: {
        subjectId: subjectId || undefined,
        ...(allowedSubjectIds ? { subjectId: { in: allowedSubjectIds } } : {}),
      },
      include: {
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return reply.send(kcs);
  });

  // POST /api/kcs (Create KC - Teacher/Admin)
  fastify.post('/', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const parseResult = CreateKCSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    if (!(await ensureSubjectOwnership(request, reply, parseResult.data.subjectId))) {
      return;
    }

    const { subjectId, ...rest } = parseResult.data;
    const kc = await prisma.knowledgeComponent.create({
      data: { ...rest, subjectId },
    });

    // Create initial StudentMastery for all enrolled students in this subject
    const enrollments = await prisma.classEnrollment.findMany({
      where: { subjectId: kc.subjectId },
    });

    if (enrollments.length > 0) {
      await prisma.studentMastery.createMany({
        data: enrollments.map((enr: { studentId: string }) => ({
          studentId: enr.studentId,
          kcId: kc.id,
          pMastery: kc.defaultPInit,
          pInit: kc.defaultPInit,
          pTransit: kc.defaultPTransit,
          pSlip: kc.defaultPSlip,
          pGuess: kc.defaultPGuess,
        })),
      });
    }

    request.log.info({ userId: request.user?.userId, kcId: kc.id }, 'kc.created');
    return reply.status(201).send(kc);
  });

  // PUT /api/kcs/:id
  fastify.put(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = UpdateKCSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
      }

      const kc = await getOwnedKc(request, reply, id);
      if (!kc) return;

      const updated = await prisma.knowledgeComponent.update({
        where: { id },
        data: parseResult.data,
      });

      request.log.info({ userId: request.user?.userId, kcId: id }, 'kc.updated');
      return reply.send(updated);
    }
  );

  // DELETE /api/kcs/:id
  fastify.delete(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const kc = await getOwnedKc(request, reply, id);
      if (!kc) return;

      await prisma.knowledgeComponent.delete({ where: { id } });
      request.log.info({ userId: request.user?.userId, kcId: id }, 'kc.deleted');
      return reply.send({ message: 'Componente de conhecimento removido com sucesso' });
    }
  );
}
