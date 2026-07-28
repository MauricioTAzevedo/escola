import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';

const OptionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, 'Texto da opção é obrigatório'),
});

const CreateQuestionSchema = z.object({
  subjectId: z.string().min(1, 'ID da disciplina é obrigatório'),
  kcId: z.string().min(1, 'ID do componente de conhecimento é obrigatório'),
  statement: z.string().min(5, 'Enunciado da questão é obrigatório'),
  type: z.enum(['MULTIPLE_CHOICE', 'OPEN_TEXT']).default('MULTIPLE_CHOICE'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  options: z.array(OptionSchema).optional(),
  correctAnswer: z.string().min(1, 'Resposta correta é obrigatória'),
  explanation: z.string().optional(),
  isApproved: z.boolean().default(true),
});

const UpdateQuestionSchema = CreateQuestionSchema.partial();

export async function questionRoutes(fastify: FastifyInstance) {
  // GET /api/questions?subjectId=...&kcId=...
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { subjectId, kcId } = request.query as { subjectId?: string; kcId?: string };

    const questions = await prisma.question.findMany({
      where: {
        ...(subjectId ? { subjectId } : {}),
        ...(kcId ? { kcId } : {}),
      },
      include: {
        kc: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = questions.map((q) => ({
      id: q.id,
      subjectId: q.subjectId,
      kcId: q.kcId,
      kcName: q.kc.name,
      statement: q.statement,
      type: q.type,
      difficulty: q.difficulty,
      options: q.optionsJson ? JSON.parse(q.optionsJson) : undefined,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      isAiGenerated: q.isAiGenerated,
      isApproved: q.isApproved,
      createdAt: q.createdAt.toISOString(),
    }));

    return reply.send(formatted);
  });

  // POST /api/questions (Teacher/Admin)
  fastify.post('/', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const parseResult = CreateQuestionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const { options, ...data } = parseResult.data;

    const question = await prisma.question.create({
      data: {
        ...data,
        optionsJson: options ? JSON.stringify(options) : null,
      },
    });

    return reply.status(201).send({
      ...question,
      options,
    });
  });

  // PUT /api/questions/:id (Teacher/Admin)
  fastify.put(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = UpdateQuestionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
      }

      const { options, ...data } = parseResult.data;

      const updated = await prisma.question.update({
        where: { id },
        data: {
          ...data,
          ...(options !== undefined ? { optionsJson: JSON.stringify(options) } : {}),
        },
      });

      return reply.send({
        ...updated,
        options: updated.optionsJson ? JSON.parse(updated.optionsJson) : undefined,
      });
    }
  );

  // DELETE /api/questions/:id (Teacher/Admin)
  fastify.delete(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // 1. Delete dependent attempt records first to satisfy foreign key constraints
      await prisma.attempt.deleteMany({ where: { questionId: id } });

      // 2. Delete question
      await prisma.question.delete({ where: { id } });

      return reply.send({ message: 'Questão removida com sucesso' });
    }
  );
}
