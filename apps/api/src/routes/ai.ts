import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../plugins/auth';
import { aiTutorService } from '../ai/AiTutorService';

const GenerateQuestionsSchema = z.object({
  rawText: z
    .string()
    .min(20, 'Forneça um texto base com pelo menos 20 caracteres')
    .max(20000, 'Texto base muito longo (máximo 20.000 caracteres)'),
  kcName: z.string().min(2, 'Nome do componente de conhecimento é obrigatório').max(200),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  count: z.number().min(1).max(5).default(3),
});

export async function aiRoutes(fastify: FastifyInstance) {
  // POST /api/ai/generate-questions (Teacher/Admin only)
  fastify.post(
    '/generate-questions',
    {
      preHandler: [requireRole(['TEACHER', 'ADMIN'])],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = GenerateQuestionsSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Dados de solicitação inválidos',
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { rawText, kcName, difficulty, count } = parseResult.data;
      const userId = request.user!.userId;

      try {
        const draftQuestions = await aiTutorService.generateQuestionsFromContent(
          userId,
          rawText,
          kcName,
          difficulty,
          count
        );

        request.log.info({ userId }, 'ai.questions_generated');
        return reply.send({
          draftQuestions: draftQuestions.map((q) => ({
            ...q,
            isApproved: false, // Explicitly false: Teacher must review and approve before publishing!
          })),
        });
      } catch (err: any) {
        if (err.message === 'AI_INPUT_TOO_LARGE') {
          return reply.status(400).send({ error: 'Texto base muito longo' });
        }
        return reply.status(500).send({
          error: 'Falha ao gerar questões via IA. Tente novamente em instantes.',
        });
      }
    }
  );

  // POST /api/ai/transform-question (Teacher/Admin - Generate variant or explanation)
  fastify.post(
    '/transform-question',
    {
      preHandler: [requireRole(['TEACHER', 'ADMIN'])],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const TransformSchema = z.object({
        action: z.enum(['variant', 'explanation']),
        statement: z.string().min(5).max(5000),
        options: z
          .array(z.object({ id: z.string().max(50), text: z.string().max(1000) }))
          .optional(),
        correctAnswer: z.string().max(50).optional(),
      });

      const parseResult = TransformSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Dados inválidos para transformação' });
      }

      const { action, statement, options, correctAnswer } = parseResult.data;
      const userId = request.user!.userId;

      try {
        if (action === 'variant') {
          const variant = await aiTutorService.generateQuestionVariant(
            userId,
            statement,
            options,
            correctAnswer
          );
          request.log.info({ userId }, 'ai.variant_generated');
          return reply.send({ variant });
        } else {
          const explanation = await aiTutorService.generateQuestionExplanation(
            userId,
            statement,
            options,
            correctAnswer
          );
          request.log.info({ userId }, 'ai.explanation_generated');
          return reply.send({ explanation });
        }
      } catch (err: any) {
        if (err.message === 'AI_INPUT_TOO_LARGE') {
          return reply.status(400).send({ error: 'Conteúdo muito longo' });
        }
        return reply.status(500).send({
          error: 'Erro ao transformar questão via IA. Tente novamente em instantes.',
        });
      }
    }
  );
}
