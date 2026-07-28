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
  // GET /api/subjects (List subjects for logged teacher or admin)
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const isTeacher = request.user?.role === 'TEACHER';
    const subjects = await prisma.subject.findMany({
      where: isTeacher ? { teacherId: request.user!.userId } : {},
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

    const result = subjects.map((sub) => ({
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

    if (request.user?.role !== 'ADMIN' && subject.teacherId !== request.user?.userId) {
      return reply
        .status(403)
        .send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
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

    // Auto-enroll existing students in the new subject
    const students = await prisma.user.findMany({ where: { role: 'STUDENT' } });
    if (students.length > 0) {
      await prisma.classEnrollment.createMany({
        data: students.map((st) => ({ studentId: st.id, subjectId: subject.id })),
      });
    }

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

      await prisma.subject.delete({ where: { id } });
      return reply.send({ message: 'Disciplina removida com sucesso' });
    }
  );
}
