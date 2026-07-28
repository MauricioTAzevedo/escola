import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../plugins/auth';
import { aiTutorService } from '../ai/AiTutorService';

const GenerateQuestionsSchema = z.object({
  rawText: z.string().min(20, 'Forneça um texto base com pelo menos 20 caracteres'),
  kcName: z.string().min(2, 'Nome do componente de conhecimento é obrigatório'),
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

      try {
        const draftQuestions = await aiTutorService.generateQuestionsFromContent(
          rawText,
          kcName,
          difficulty,
          count
        );

        return reply.send({
          draftQuestions: draftQuestions.map((q) => ({
            ...q,
            isApproved: false, // Explicitly false: Teacher must review and approve before publishing!
          })),
        });
      } catch (err: any) {
        return reply.status(500).send({
          error: err.message || 'Falha ao gerar questões via IA',
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
        statement: z.string().min(5),
        options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
        correctAnswer: z.string().optional(),
      });

      const parseResult = TransformSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Dados inválidos para transformação' });
      }

      const { action, statement, options, correctAnswer } = parseResult.data;

      try {
        if (action === 'variant') {
          const variant = await aiTutorService.generateQuestionVariant(
            statement,
            options,
            correctAnswer
          );
          return reply.send({ variant });
        } else {
          const explanation = await aiTutorService.generateQuestionExplanation(
            statement,
            options,
            correctAnswer
          );
          return reply.send({ explanation });
        }
      } catch (err: any) {
        return reply
          .status(500)
          .send({ error: err.message || 'Erro ao transformar questão via IA' });
      }
    }
  );
}
