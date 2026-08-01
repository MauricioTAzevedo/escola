import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';

import { sanitizeString } from '../lib/sanitize';

const CreateSubjectSchema = z.object({
  name: z.string().min(2, 'Nome da disciplina é obrigatório').transform(sanitizeString),
  description: z.string().default('').transform(sanitizeString),
});

const UpdateSubjectSchema = z.object({
  name: z
    .string()
    .min(2)
    .optional()
    .transform((v) => (v ? sanitizeString(v) : v)),
  description: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeString(v) : v)),
});

export async function subjectRoutes(fastify: FastifyInstance) {
  // GET /api/subjects (List subjects for the logged user)
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const role = request.user?.role;

    let where: Record<string, any> = {};
    if (role === 'TEACHER') {
      where = { teacherId: request.user!.userId };
    } else if (role === 'STUDENT') {
      // Students only see subjects they are enrolled in
      const enrollments = await prisma.classEnrollment.findMany({
        where: { studentId: request.user!.userId },
        select: { subjectId: true },
      });
      where = { id: { in: enrollments.map((e) => e.subjectId) } };
    }

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        _count: {
          select: {
            knowledgeComponents: true,
            questions: true,
            enrollments: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = subjects.map((sub: any) => ({
      id: sub.id,
      name: sub.name,
      description: sub.description,
      teacherId: sub.teacherId,
      kcCount: sub._count.knowledgeComponents,
      questionCount: sub._count.questions,
      studentCount: sub._count.enrollments,
      createdAt: sub.createdAt.toISOString(),
    }));

    return reply.send(result);
  });

  // GET /api/subjects/:id
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        knowledgeComponents: true,
        _count: {
          select: { questions: true, enrollments: true },
        },
      },
    });

    if (!subject) {
      return reply.status(404).send({ error: 'Disciplina não encontrada' });
    }

    const role = request.user?.role;
    if (role === 'ADMIN') {
      // allowed
    } else if (role === 'TEACHER') {
      if (subject.teacherId !== request.user?.userId) {
        return reply
          .status(403)
          .send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
      }
    } else {
      const enrolled = await prisma.classEnrollment.findFirst({
        where: { studentId: request.user!.userId, subjectId: id },
      });
      if (!enrolled) {
        return reply
          .status(403)
          .send({ error: 'Acesso negado. Você não está matriculado nesta disciplina.' });
      }
    }

    return reply.send({
      id: subject.id,
      name: subject.name,
      description: subject.description,
      teacherId: subject.teacherId,
      knowledgeComponents: subject.knowledgeComponents,
      questionCount: subject._count.questions,
      studentCount: subject._count.enrollments,
      createdAt: subject.createdAt.toISOString(),
    });
  });

  // POST /api/subjects (Create subject - Teacher/Admin)
  fastify.post('/', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const parseResult = CreateSubjectSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const subject = await prisma.subject.create({
      data: {
        ...parseResult.data,
        teacherId: request.user!.userId,
      },
    });

    request.log.info({ userId: request.user?.userId, subjectId: subject.id }, 'subject.created');
    return reply.status(201).send(subject);
  });

  // PUT /api/subjects/:id (Update subject - Teacher/Admin)
  fastify.put(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = UpdateSubjectSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
      }

      const existing = await prisma.subject.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Disciplina não encontrada' });
      }

      if (request.user?.role !== 'ADMIN' && existing.teacherId !== request.user?.userId) {
        return reply
          .status(403)
          .send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
      }

      const updated = await prisma.subject.update({
        where: { id },
        data: parseResult.data,
      });

      request.log.info({ userId: request.user?.userId, subjectId: id }, 'subject.updated');
      return reply.send(updated);
    }
  );

  // DELETE /api/subjects/:id (Delete subject - Teacher/Admin)
  fastify.delete(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.subject.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Disciplina não encontrada' });
      }

      if (request.user?.role !== 'ADMIN' && existing.teacherId !== request.user?.userId) {
        return reply
          .status(403)
          .send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
      }

      const questionIds = await prisma.question.findMany({
        where: { subjectId: id },
        select: { id: true },
      });

      await prisma.$transaction([
        prisma.attempt.deleteMany({
          where: { questionId: { in: questionIds.map((q) => q.id) } },
        }),
        prisma.studentMastery.deleteMany({
          where: { kc: { subjectId: id } },
        }),
        prisma.classEnrollment.deleteMany({ where: { subjectId: id } }),
        prisma.question.deleteMany({ where: { subjectId: id } }),
        prisma.knowledgeComponent.deleteMany({ where: { subjectId: id } }),
        prisma.subject.delete({ where: { id } }),
      ]);

      request.log.info({ userId: request.user?.userId, subjectId: id }, 'subject.deleted');
      return reply.send({ message: 'Disciplina removida com sucesso' });
    }
  );
}
