import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';

const CreateKCSchema = z.object({
  subjectId: z.string().min(1, 'ID da disciplina é obrigatório'),
  name: z.string().min(2, 'Nome do componente de conhecimento é obrigatório'),
  description: z.string().default(''),
  defaultPInit: z.number().min(0).max(1).default(0.1),
  defaultPTransit: z.number().min(0).max(1).default(0.15),
  defaultPSlip: z.number().min(0).max(1).default(0.1),
  defaultPGuess: z.number().min(0).max(1).default(0.2),
});

const UpdateKCSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  defaultPInit: z.number().min(0).max(1).optional(),
  defaultPTransit: z.number().min(0).max(1).optional(),
  defaultPSlip: z.number().min(0).max(1).optional(),
  defaultPGuess: z.number().min(0).max(1).optional(),
});

export async function kcRoutes(fastify: FastifyInstance) {
  // GET /api/kcs?subjectId=...
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { subjectId } = request.query as { subjectId?: string };

    const kcs = await prisma.knowledgeComponent.findMany({
      where: subjectId ? { subjectId } : undefined,
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
      return reply.status(400).send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const kc = await prisma.knowledgeComponent.create({
      data: parseResult.data,
    });

    // Create initial StudentMastery for all enrolled students in this subject
    const enrollments = await prisma.classEnrollment.findMany({
      where: { subjectId: kc.subjectId },
    });

    if (enrollments.length > 0) {
      await prisma.studentMastery.createMany({
        data: enrollments.map((enr) => ({
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

    return reply.status(201).send(kc);
  });

  // PUT /api/kcs/:id
  fastify.put('/:id', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = UpdateKCSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const updated = await prisma.knowledgeComponent.update({
      where: { id },
      data: parseResult.data,
    });

    return reply.send(updated);
  });

  // DELETE /api/kcs/:id
  fastify.delete('/:id', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.knowledgeComponent.delete({ where: { id } });
    return reply.send({ message: 'Componente de conhecimento removido com sucesso' });
  });
}
