import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { requireRole } from '../plugins/auth';

function escapeCsvCell(val: string): string {
  let str = val.replace(/"/g, '""');
  // SEC-23: Escape CSV formula injection vectors (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str}"`;
}

export async function teacherRoutes(fastify: FastifyInstance) {
  // GET /api/teacher/analytics?subjectId=...
  fastify.get(
    '/analytics',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { subjectId } = request.query as { subjectId?: string };

      const isTeacher = request.user?.role === 'TEACHER';
      const subjects = await prisma.subject.findMany({
        where: isTeacher ? { teacherId: request.user!.userId } : {},
        select: { id: true, name: true },
      });

      const activeSubjectId = subjectId || (subjects.length > 0 ? subjects[0].id : null);

      if (!activeSubjectId) {
        return reply.send({
          subjects: [],
          activeSubjectId: null,
          totalQuestions: 0,
          totalKcs: 0,
          aiGeneratedCount: 0,
          manualCount: 0,
          difficultyStats: { EASY: 0, MEDIUM: 0, HARD: 0 },
          kcCoverage: [],
        });
      }

      // Check ownership if explicit subjectId passed
      if (subjectId) {
        const targetSubject = await prisma.subject.findUnique({ where: { id: subjectId } });
        if (!targetSubject) {
          return reply.status(404).send({ error: 'Disciplina não encontrada' });
        }
        if (request.user?.role !== 'ADMIN' && targetSubject.teacherId !== request.user?.userId) {
          return reply.status(403).send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
        }
      }

      // Fetch KCs for subject
      const kcs = await prisma.knowledgeComponent.findMany({
        where: { subjectId: activeSubjectId },
        include: {
          _count: { select: { questions: true } },
        },
        orderBy: { name: 'asc' },
      });

      // Fetch all questions for subject
      const questions = await prisma.question.findMany({
        where: { subjectId: activeSubjectId },
        select: {
          id: true,
          kcId: true,
          difficulty: true,
          isAiGenerated: true,
          type: true,
        },
      });

      const totalQuestions = questions.length;
      const aiGeneratedCount = questions.filter((q: any) => q.isAiGenerated).length;
      const manualCount = totalQuestions - aiGeneratedCount;

      const difficultyStats = {
        EASY: questions.filter((q: any) => q.difficulty === 'EASY').length,
        MEDIUM: questions.filter((q: any) => q.difficulty === 'MEDIUM').length,
        HARD: questions.filter((q: any) => q.difficulty === 'HARD').length,
      };

      const kcCoverage = kcs.map((kc: any) => ({
        kcId: kc.id,
        kcName: kc.name,
        questionCount: kc._count.questions,
      }));

      return reply.send({
        subjects,
        activeSubjectId,
        totalQuestions,
        totalKcs: kcs.length,
        aiGeneratedCount,
        manualCount,
        difficultyStats,
        kcCoverage,
      });
    }
  );

  // GET /api/teacher/export-csv?subjectId=...
  fastify.get(
    '/export-csv',
    { preHandler: [requireRole(['TEACHER', 'ADMIN'])] },
    async (request, reply) => {
      const { subjectId } = request.query as { subjectId?: string };

      if (!subjectId) {
        return reply.status(400).send({ error: 'ID da disciplina é obrigatório' });
      }

      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) {
        return reply.status(404).send({ error: 'Disciplina não encontrada' });
      }

      if (request.user?.role !== 'ADMIN' && subject.teacherId !== request.user?.userId) {
        return reply.status(403).send({ error: 'Acesso negado. Você não é o proprietário desta disciplina.' });
      }

      const questions = await prisma.question.findMany({
        where: { subjectId },
        include: { kc: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      // Generate CSV Header for Question Bank
      let csv = `ID,Componente de Conhecimento,Enunciado,Tipo,Dificuldade,Opção Correta,Gerado por IA,Explicação\n`;

      // Generate Rows
      questions.forEach((q: any) => {
        csv += `${escapeCsvCell(q.id)},${escapeCsvCell(q.kc.name)},${escapeCsvCell(q.statement)},${escapeCsvCell(q.type)},${escapeCsvCell(q.difficulty)},${escapeCsvCell(q.correctAnswer)},${escapeCsvCell(q.isAiGenerated ? 'Sim' : 'Não')},${escapeCsvCell(q.explanation || '')}\n`;
      });

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header(
        'Content-Disposition',
        `attachment; filename="banco_questoes_${subject.name}.csv"`
      );
      return reply.send(csv);
    }
  );
}
