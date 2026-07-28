import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';

const CreateSubjectSchema = z.object({
  name: z.string().min(2, 'Nome da disciplina é obrigatório'),
  description: z.string().default(''),
});

const UpdateSubjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
});

export async function subjectRoutes(fastify: FastifyInstance) {
  // GET /api/subjects (List subjects)
  fastify.get('/', { preHandler: [authenticate] }, async (_request, reply) => {
    const subjects = await prisma.subject.findMany({
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

    return reply.send({
      ...subject,
      kcCount: subject.knowledgeComponents.length,
      questionCount: subject._count.questions,
      studentCount: subject._count.enrollments,
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

    const { name, description } = parseResult.data;
    const teacherId = request.user!.userId;

    const subject = await prisma.subject.create({
      data: {
        name,
        description,
        teacherId,
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

      await prisma.subject.delete({ where: { id } });
      return reply.send({ message: 'Disciplina removida com sucesso' });
    }
  );
}
