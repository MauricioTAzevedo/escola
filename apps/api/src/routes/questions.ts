import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../plugins/auth';
import { sanitizeString } from '../lib/sanitize';

const OptionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, 'Texto da opção é obrigatório').transform(sanitizeString),
});

const CreateQuestionSchema = z.object({
  subjectId: z.string().min(1, 'ID da disciplina é obrigatório'),
  kcId: z.string().min(1, 'ID do componente de conhecimento é obrigatório'),
  statement: z.string().min(5, 'Enunciado da questão é obrigatório').transform(sanitizeString),
  type: z.enum(['MULTIPLE_CHOICE', 'OPEN_TEXT']).default('MULTIPLE_CHOICE'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  options: z.array(OptionSchema).optional(),
  correctAnswer: z.string().min(1, 'Resposta correta é obrigatória'),
  explanation: z
    .string()
    .optional()
    .transform((val) => (val ? sanitizeString(val) : val)),
  imageUrl: z
    .string()
    .optional()
    .transform((val) => (val ? sanitizeString(val) : val)),
});

const UpdateQuestionSchema = CreateQuestionSchema.partial();

const BulkImportSchema = z.object({
  subjectId: z.string().min(1, 'ID da disciplina é obrigatório'),
  kcId: z.string().min(1, 'ID do componente de conhecimento é obrigatório'),
  questions: z
    .array(
      z.object({
        statement: z.string().min(5, 'Enunciado inválido').transform(sanitizeString),
        type: z.enum(['MULTIPLE_CHOICE', 'OPEN_TEXT']).default('MULTIPLE_CHOICE'),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
        options: z.array(OptionSchema).optional(),
        correctAnswer: z.string().min(1, 'Resposta correta é obrigatória'),
        explanation: z
          .string()
          .optional()
          .transform((val) => (val ? sanitizeString(val) : val)),
        imageUrl: z
          .string()
          .optional()
          .transform((val) => (val ? sanitizeString(val) : val)),
      })
    )
    .min(1, 'Pelo menos 1 questão deve ser fornecida'),
});

async function getOwnedSubjectOr404(
  request: any,
  reply: any,
  subjectId: string
): Promise<boolean> {
  const user = request.user;
  const where =
    user.role === 'ADMIN' ? { id: subjectId } : { id: subjectId, teacherId: user.userId };
  const subject = await prisma.subject.findFirst({ where });
  if (!subject) {
    const exists = await prisma.subject.findUnique({ where: { id: subjectId } });
    reply
      .status(exists ? 403 : 404)
      .send({
        error: exists
          ? 'Acesso negado. Você não é o professor desta disciplina.'
          : 'Disciplina não encontrada',
      });
    return false;
  }
  return true;
}

async function getOwnedQuestionOr404(request: any, reply: any, id: string) {
  const user = request.user;
  const where =
    user.role === 'ADMIN'
      ? { id }
      : { id, subject: { teacherId: user.userId } };
  const question = await prisma.question.findFirst({ where, include: { subject: true } });
  if (!question) {
    const exists = await prisma.question.findUnique({ where: { id } });
    reply
      .status(exists ? 403 : 404)
      .send({
        error: exists
          ? 'Acesso negado. Você não é o proprietário desta disciplina.'
          : 'Questão não encontrada',
      });
    return null;
  }
  return question;
}

function formatQuestion(q: any, includeAnswers: boolean) {
  return {
    id: q.id,
    subjectId: q.subjectId,
    kcId: q.kcId,
    kcName: q.kc?.name,
    statement: q.statement,
    type: q.type,
    difficulty: q.difficulty,
    options: q.optionsJson ? JSON.parse(q.optionsJson) : undefined,
    ...(includeAnswers
      ? { correctAnswer: q.correctAnswer, explanation: q.explanation || undefined }
      : {}),
    imageUrl: q.imageUrl || undefined,
    isAiGenerated: q.isAiGenerated,
    isApproved: q.isApproved,
    createdAt: q.createdAt.toISOString(),
  };
}

export async function questionRoutes(fastify: FastifyInstance) {
  // GET /api/questions?subjectId=...&kcId=...
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { subjectId, kcId } = request.query as { subjectId?: string; kcId?: string };
    const user = request.user;

    let subjectWhere: Record<string, any> = {};
    let approvedOnly = false;

    if (user?.role === 'STUDENT') {
      // Students only see approved questions from their enrolled subjects
      approvedOnly = true;
      const enrollments = await prisma.classEnrollment.findMany({
        where: { studentId: user.userId },
        select: { subjectId: true },
      });
      subjectWhere = { subjectId: { in: enrollments.map((e) => e.subjectId) } };
    } else if (user?.role === 'TEACHER') {
      // Teachers only see questions from their own subjects
      const subjects = await prisma.subject.findMany({
        where: { teacherId: user.userId },
        select: { id: true },
      });
      subjectWhere = { subjectId: { in: subjects.map((s) => s.id) } };
    }

    if (subjectId) {
      if (user?.role === 'STUDENT') {
        const enrolled = await prisma.classEnrollment.findFirst({
          where: { studentId: user.userId, subjectId },
        });
        if (!enrolled) {
          return reply.status(403).send({ error: 'Acesso negado. Você não está matriculado nesta disciplina.' });
        }
      } else if (user?.role === 'TEACHER') {
        const owned = await prisma.subject.findFirst({
          where: { id: subjectId, teacherId: user.userId },
        });
        if (!owned) {
          return reply.status(403).send({ error: 'Acesso negado. Você não é o professor desta disciplina.' });
        }
      }
      subjectWhere = { subjectId };
    }

    const questions = await prisma.question.findMany({
      where: {
        ...subjectWhere,
        ...(kcId ? { kcId } : {}),
        ...(approvedOnly ? { isApproved: true } : {}),
      },
      include: {
        kc: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const includeAnswers = user?.role === 'TEACHER' || user?.role === 'ADMIN';
    return reply.send(questions.map((q) => formatQuestion(q, includeAnswers)));
  });

  // GET /api/questions/:id (role-aware single question)
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = request.user;

    const question = await prisma.question.findUnique({
      where: { id },
      include: { kc: { select: { id: true, name: true } } },
    });
    if (!question) {
      return reply.status(404).send({ error: 'Questão não encontrada' });
    }

    if (user?.role === 'STUDENT') {
      const enrolled = await prisma.classEnrollment.findFirst({
        where: { studentId: user.userId, subjectId: question.subjectId },
      });
      if (!enrolled || !question.isApproved) {
        return reply.status(403).send({ error: 'Acesso negado' });
      }
      return reply.send(formatQuestion(question, false));
    }

    if (user?.role === 'TEACHER') {
      const owned = await prisma.subject.findFirst({
        where: { id: question.subjectId, teacherId: user.userId },
      });
      if (!owned) {
        return reply.status(403).send({ error: 'Acesso negado. Você não é o professor desta disciplina.' });
      }
      return reply.send(formatQuestion(question, true));
    }

    return reply.send(formatQuestion(question, true));
  });

  // POST /api/questions (Teacher/Admin)
  fastify.post('/', { preHandler: [requireRole(['TEACHER', 'ADMIN'])] }, async (request, reply) => {
    const parseResult = CreateQuestionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply
        .status(400)
        .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const { subjectId, kcId, options, ...data } = parseResult.data;

    if (!(await getOwnedSubjectOr404(request, reply, subjectId))) {
      return;
    }

    const kc = await prisma.knowledgeComponent.findFirst({
      where: { id: kcId, subjectId },
    });
    if (!kc) {
      return reply.status(400).send({ error: 'Componente de conhecimento inválido para esta disciplina' });
    }

    // isApproved is always server-controlled: manual teacher questions are approved immediately
    const question = await prisma.question.create({
      data: {
        ...data,
        subjectId,
        kcId,
        optionsJson: options ? JSON.stringify(options) : null,
        isApproved: true,
      },
    });

    request.log.info({ userId: request.user?.userId, questionId: question.id }, 'question.created');
    return reply.status(201).send(formatQuestion(question, true));
  });

  // PUT /api/questions/:id (Teacher/Admin)
  fastify.put(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await getOwnedQuestionOr404(request, reply, id);
      if (!existing) return;

      const parseResult = UpdateQuestionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply
          .status(400)
          .send({ error: 'Dados inválidos', details: parseResult.error.flatten().fieldErrors });
      }

      const { subjectId, kcId, options, ...data } = parseResult.data;

      if (subjectId && !(await getOwnedSubjectOr404(request, reply, subjectId))) {
        return;
      }
      if (kcId) {
        const kc = await prisma.knowledgeComponent.findFirst({
          where: { id: kcId, subjectId: subjectId || existing.subjectId },
        });
        if (!kc) {
          return reply.status(400).send({ error: 'Componente de conhecimento inválido para esta disciplina' });
        }
      }

      const updated = await prisma.question.update({
        where: { id },
        data: {
          ...data,
          ...(subjectId ? { subjectId } : {}),
          ...(kcId ? { kcId } : {}),
          ...(options !== undefined ? { optionsJson: JSON.stringify(options) } : {}),
        },
      });

      request.log.info({ userId: request.user?.userId, questionId: id }, 'question.updated');
      return reply.send(formatQuestion(updated, true));
    }
  );

  // POST /api/questions/:id/approve (Teacher/Admin - approve AI draft)
  fastify.post(
    '/:id/approve',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await getOwnedQuestionOr404(request, reply, id);
      if (!existing) return;

      const updated = await prisma.question.update({
        where: { id },
        data: { isApproved: true },
      });

      request.log.info({ userId: request.user?.userId, questionId: id }, 'question.approved');
      return reply.send({ ...formatQuestion(updated, true), isApproved: true });
    }
  );

  // DELETE /api/questions/:id (Teacher/Admin)
  fastify.delete(
    '/:id',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await getOwnedQuestionOr404(request, reply, id);
      if (!existing) return;

      await prisma.$transaction([
        prisma.attempt.deleteMany({ where: { questionId: id } }),
        prisma.question.delete({ where: { id } }),
      ]);

      request.log.info({ userId: request.user?.userId, questionId: id }, 'question.deleted');
      return reply.send({ message: 'Questão removida com sucesso' });
    }
  );

  // POST /api/questions/bulk (Teacher/Admin - Bulk import CSV/JSON)
  fastify.post(
    '/bulk',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const parseResult = BulkImportSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Dados de importação em lote inválidos',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { subjectId, kcId, questions } = parseResult.data;

      if (!(await getOwnedSubjectOr404(request, reply, subjectId))) {
        return;
      }

      const kc = await prisma.knowledgeComponent.findFirst({
        where: { id: kcId, subjectId },
      });
      if (!kc) {
        return reply.status(400).send({ error: 'Componente de conhecimento inválido para esta disciplina' });
      }

      const createdQuestions = await prisma.$transaction(
        questions.map((q) => {
          const { options, ...qData } = q;
          return prisma.question.create({
            data: {
              ...qData,
              subjectId,
              kcId,
              optionsJson: options ? JSON.stringify(options) : null,
              isApproved: true,
            },
          });
        })
      );

      request.log.info(
        { userId: request.user?.userId, subjectId, count: createdQuestions.length },
        'questions.bulk_imported'
      );
      return reply.status(201).send({
        importedCount: createdQuestions.length,
        message: `${createdQuestions.length} questão(ões) importada(s) com sucesso!`,
      });
    }
  );
}
