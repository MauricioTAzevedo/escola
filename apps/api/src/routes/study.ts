import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AdaptivePolicy, updateMastery } from '@escola/bkt-engine';
import { prisma } from '../lib/prisma';
import { authenticate } from '../plugins/auth';
import { aiTutorService } from '../ai/AiTutorService';

const SubmitAnswerSchema = z.object({
  questionId: z.string().min(1, 'ID da questão é obrigatório'),
  selectedOptionId: z.string().optional(),
  textAnswer: z.string().optional(),
});

const adaptivePolicy = new AdaptivePolicy();

export async function studyRoutes(fastify: FastifyInstance) {
  // GET /api/study/next-question?subjectId=...
  fastify.get('/next-question', { preHandler: [authenticate] }, async (request, reply) => {
    const { subjectId } = request.query as { subjectId?: string };
    const studentId = request.user!.userId;

    if (!subjectId) {
      return reply.status(400).send({ error: 'ID da disciplina é obrigatório' });
    }

    // 1. Fetch student masteries for this subject's KCs
    const masteries = await prisma.studentMastery.findMany({
      where: {
        studentId,
        kc: { subjectId },
      },
      select: { kcId: true, pMastery: true },
    });

    // 2. Fetch candidate questions for the subject
    const candidateQuestions = await prisma.question.findMany({
      where: {
        subjectId,
        isApproved: true,
      },
      select: {
        id: true,
        kcId: true,
        difficulty: true,
      },
    });

    if (candidateQuestions.length === 0) {
      return reply.status(404).send({ error: 'Nenhuma questão cadastrada para esta disciplina' });
    }

    // 3. Fetch recent attempt question IDs for anti-repetition filter (last 5 attempts)
    const recentAttempts = await prisma.attempt.findMany({
      where: {
        studentId,
        question: { subjectId },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { questionId: true },
    });

    const recentlyAnsweredIds = recentAttempts.map((a) => a.questionId);

    // 4. Run Adaptive Selection Policy
    const selectedCandidate = adaptivePolicy.selectNextQuestion(
      candidateQuestions,
      masteries,
      { recentlyAnsweredIds }
    );

    if (!selectedCandidate) {
      return reply.status(404).send({ error: 'Não foi possível selecionar uma questão adaptativa.' });
    }

    // 5. Fetch full question details (without revealing correctAnswer)
    const question = await prisma.question.findUnique({
      where: { id: selectedCandidate.id },
      include: {
        kc: { select: { id: true, name: true, description: true } },
      },
    });

    if (!question) {
      return reply.status(404).send({ error: 'Questão não encontrada' });
    }

    // Parse options
    const options = question.optionsJson ? JSON.parse(question.optionsJson) : undefined;

    return reply.send({
      id: question.id,
      subjectId: question.subjectId,
      kcId: question.kcId,
      kcName: question.kc.name,
      statement: question.statement,
      type: question.type,
      difficulty: question.difficulty,
      options, // Note: correctAnswer is omitted for student security!
    });
  });

  // POST /api/study/answer
  fastify.post('/answer', { preHandler: [authenticate] }, async (request, reply) => {
    const parseResult = SubmitAnswerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Dados de resposta inválidos', details: parseResult.error.flatten().fieldErrors });
    }

    const { questionId, selectedOptionId, textAnswer } = parseResult.data;
    const studentId = request.user!.userId;

    // 1. Fetch target question with KC details
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        kc: true,
      },
    });

    if (!question) {
      return reply.status(404).send({ error: 'Questão não encontrada' });
    }

    // 2. Evaluate correctness
    let isCorrect = false;
    if (question.type === 'MULTIPLE_CHOICE') {
      isCorrect = selectedOptionId === question.correctAnswer;
    } else {
      const normalizedStudentText = (textAnswer || '').trim().toLowerCase();
      const normalizedExpectedText = question.correctAnswer.trim().toLowerCase();
      isCorrect = normalizedStudentText === normalizedExpectedText;
    }

    // 3. Get existing or default StudentMastery
    let mastery = await prisma.studentMastery.findUnique({
      where: {
        studentId_kcId: {
          studentId,
          kcId: question.kcId,
        },
      },
    });

    const priorPL = mastery ? mastery.pMastery : question.kc.defaultPInit;
    const bktParams = {
      pInit: mastery ? mastery.pInit : question.kc.defaultPInit,
      pTransit: mastery ? mastery.pTransit : question.kc.defaultPTransit,
      pSlip: mastery ? mastery.pSlip : question.kc.defaultPSlip,
      pGuess: mastery ? mastery.pGuess : question.kc.defaultPGuess,
    };

    // 4. Update BKT mastery
    const newPL = updateMastery(priorPL, isCorrect, bktParams);

    // 5. Generate AI Explanation for wrong answers or feedback
    let aiExplanation = question.explanation || 'A revisão do conceito é recomendada para consolidar seu aprendizado.';
    if (!isCorrect) {
      try {
        const studentAnsText = selectedOptionId
          ? `Opção selecionada: ${selectedOptionId}`
          : textAnswer || 'Nenhuma resposta enviada';
        
        aiExplanation = await aiTutorService.generateExplanation(
          question.statement,
          studentAnsText,
          question.correctAnswer,
          question.kc.name,
          newPL
        );
      } catch (err) {
        // Fallback to static explanation on error
        aiExplanation = question.explanation || 'Análise do conceito: revise os fundamentos teóricos deste componente para reforçar seu entendimento.';
      }
    }

    // 6. Record Attempt in Database
    const attempt = await prisma.attempt.create({
      data: {
        studentId,
        questionId: question.id,
        selectedOption: selectedOptionId || null,
        textAnswer: textAnswer || null,
        isCorrect,
        previousPL: priorPL,
        newPL,
        aiExplanation,
      },
    });

    // 7. Persist updated StudentMastery record
    if (mastery) {
      await prisma.studentMastery.update({
        where: { id: mastery.id },
        data: {
          pMastery: newPL,
          totalAttempts: mastery.totalAttempts + 1,
          correctAttempts: mastery.correctAttempts + (isCorrect ? 1 : 0),
          lastUpdated: new Date(),
        },
      });
    } else {
      await prisma.studentMastery.create({
        data: {
          studentId,
          kcId: question.kcId,
          pMastery: newPL,
          pInit: bktParams.pInit,
          pTransit: bktParams.pTransit,
          pSlip: bktParams.pSlip,
          pGuess: bktParams.pGuess,
          totalAttempts: 1,
          correctAttempts: isCorrect ? 1 : 0,
        },
      });
    }

    // Get human-readable correct answer text for feedback
    let correctAnswerText = question.correctAnswer;
    if (question.type === 'MULTIPLE_CHOICE' && question.optionsJson) {
      const opts = JSON.parse(question.optionsJson) as { id: string; text: string }[];
      const found = opts.find((o) => o.id === question.correctAnswer);
      if (found) correctAnswerText = found.text;
    }

    return reply.send({
      attemptId: attempt.id,
      isCorrect,
      correctAnswerText,
      previousPL: priorPL,
      newPL,
      aiExplanation,
    });
  });

  // GET /api/study/dashboard (Student dashboard: KCs mastery list & summary)
  fastify.get('/dashboard', { preHandler: [authenticate] }, async (request, reply) => {
    const studentId = request.user!.userId;
    const { subjectId } = request.query as { subjectId?: string };

    const masteries = await prisma.studentMastery.findMany({
      where: {
        studentId,
        ...(subjectId ? { kc: { subjectId } } : {}),
      },
      include: {
        kc: {
          select: { name: true, subjectId: true, subject: { select: { name: true } } },
        },
      },
      orderBy: { pMastery: 'desc' },
    });

    const recentAttempts = await prisma.attempt.findMany({
      where: { studentId },
      include: {
        question: { select: { statement: true, kcId: true, kc: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const formattedMasteries = masteries.map((m) => ({
      kcId: m.kcId,
      kcName: m.kc.name,
      subjectName: m.kc.subject.name,
      pMastery: m.pMastery,
      totalAttempts: m.totalAttempts,
      correctAttempts: m.correctAttempts,
      lastUpdated: m.lastUpdated.toISOString(),
    }));

    const formattedAttempts = recentAttempts.map((a) => ({
      id: a.id,
      questionStatement: a.question.statement,
      kcName: a.question.kc.name,
      isCorrect: a.isCorrect,
      previousPL: a.previousPL,
      newPL: a.newPL,
      createdAt: a.createdAt.toISOString(),
    }));

    return reply.send({
      masteries: formattedMasteries,
      recentAttempts: formattedAttempts,
    });
  });
}
