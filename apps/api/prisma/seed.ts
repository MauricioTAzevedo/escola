import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const Role = {
  TEACHER: 'TEACHER',
  ADMIN: 'ADMIN',
} as const;

const QuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  OPEN_TEXT: 'OPEN_TEXT',
} as const;

const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('🛑 Refusing to seed in production.');
    process.exit(1);
  }
  console.log('🌱 Starting teacher-only database seed (pt-BR)...');

  // Clean existing database
  await prisma.attempt.deleteMany();
  await prisma.studentMastery.deleteMany();
  await prisma.classEnrollment.deleteMany();
  await prisma.question.deleteMany();
  await prisma.knowledgeComponent.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.user.deleteMany();
  await prisma.aiCache.deleteMany();

  const passwordHash = await bcrypt.hash('senha123', 10);

  // 1. Create Teacher
  const teacher = await prisma.user.create({
    data: {
      name: 'Prof. Carlos Eduardo',
      email: 'prof.carlos@escola.edu.br',
      passwordHash,
      role: Role.TEACHER,
    },
  });

  console.log('✅ Created Teacher (prof.carlos@escola.edu.br)');

  // 2. Subject 1: Programação em Python
  const pythonSubject = await prisma.subject.create({
    data: {
      name: 'Programação em Python',
      description:
        'Fundamentos de programação, estruturas de controle, funções e estruturas de dados em Python.',
      teacherId: teacher.id,
    },
  });

  // KCs for Python
  const kcPyVars = await prisma.knowledgeComponent.create({
    data: {
      subjectId: pythonSubject.id,
      name: 'Variáveis e Tipos de Dados',
      description:
        'Declaração de variáveis, tipos primitivos (int, float, str, bool) e conversões.',
    },
  });

  const kcPyCond = await prisma.knowledgeComponent.create({
    data: {
      subjectId: pythonSubject.id,
      name: 'Estruturas Condicionais (if/else)',
      description: 'Tomada de decisão com comandos if, elif e else, e operadores lógicos.',
    },
  });

  const kcPyLoops = await prisma.knowledgeComponent.create({
    data: {
      subjectId: pythonSubject.id,
      name: 'Laços de Repetição (for/while)',
      description: 'Repetição iterativa com for e range, e repetição condicional com while.',
    },
  });

  const kcPyFuncs = await prisma.knowledgeComponent.create({
    data: {
      subjectId: pythonSubject.id,
      name: 'Funções e Escopo',
      description:
        'Definição de funções com def, parâmetros, valores de retorno e escopo de variáveis.',
    },
  });

  const kcPyLists = await prisma.knowledgeComponent.create({
    data: {
      subjectId: pythonSubject.id,
      name: 'Listas e Dicionários',
      description:
        'Estruturas de dados compostas, indexação, fatiamento e métodos como append, pop e dict keys.',
    },
  });

  // Questions for Python
  const pythonQuestions = [
    {
      subjectId: pythonSubject.id,
      kcId: kcPyVars.id,
      statement: 'Qual é o tipo de dado da variável `x` em Python após a atribuição: `x = 3.14`?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'int' },
        { id: 'opt2', text: 'float' },
        { id: 'opt3', text: 'str' },
        { id: 'opt4', text: 'double' },
      ]),
      correctAnswer: 'opt2',
      explanation: 'Em Python, números decimais são do tipo primitivo `float`.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyVars.id,
      statement: 'Qual é o resultado da expressão `"5" + "5"` em Python?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: '10' },
        { id: 'opt2', text: '"55"' },
        { id: 'opt3', text: 'Erro de sintaxe' },
        { id: 'opt4', text: 'None' },
      ]),
      correctAnswer: 'opt2',
      explanation:
        'O operador `+` entre duas strings realiza a concatenação, resultando em `"55"`.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyCond.id,
      statement:
        'Qual palavra-chave é usada em Python para adicionar uma condição intermediária entre `if` e `else`?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'else if' },
        { id: 'opt2', text: 'elseif' },
        { id: 'opt3', text: 'elif' },
        { id: 'opt4', text: 'then' },
      ]),
      correctAnswer: 'opt3',
      explanation: 'Em Python, a contração correta para "else if" é a palavra-chave `elif`.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyCond.id,
      statement: 'O que o comando `if not (x > 5 and y < 10)` avalia quando `x = 7` e `y = 3`?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.MEDIUM,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'True' },
        { id: 'opt2', text: 'False' },
        { id: 'opt3', text: 'None' },
        { id: 'opt4', text: 'Erro de execução' },
      ]),
      correctAnswer: 'opt2',
      explanation:
        'Como `x > 5` (7 > 5, True) e `y < 10` (3 < 10, True) são ambos verdadeiros, a expressão interna é True. O operador `not` inverte para False.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyLoops.id,
      statement: 'Quantas vezes o laço `for i in range(2, 6):` será executado?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: '6 vezes' },
        { id: 'opt2', text: '5 vezes' },
        { id: 'opt3', text: '4 vezes' },
        { id: 'opt4', text: '3 vezes' },
      ]),
      correctAnswer: 'opt3',
      explanation: 'A função `range(2, 6)` gera os valores 2, 3, 4 e 5, totalizando 4 execuções.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyLoops.id,
      statement:
        'Qual comando é utilizado para interromper imediatamente a execução de um laço `while` ou `for`?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'stop' },
        { id: 'opt2', text: 'exit' },
        { id: 'opt3', text: 'continue' },
        { id: 'opt4', text: 'break' },
      ]),
      correctAnswer: 'opt4',
      explanation: 'O comando `break` encerra prematuramente a execução do laço de repetição.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyFuncs.id,
      statement: 'Como se define uma função que retorna a soma de dois números em Python?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'function soma(a, b): return a + b' },
        { id: 'opt2', text: 'def soma(a, b): return a + b' },
        { id: 'opt3', text: 'def soma(a, b) { return a + b }' },
        { id: 'opt4', text: 'create soma(a, b) => a + b' },
      ]),
      correctAnswer: 'opt2',
      explanation: 'Funções em Python são declaradas com a palavra-chave `def`.',
    },
    {
      subjectId: pythonSubject.id,
      kcId: kcPyLists.id,
      statement:
        'Qual é o elemento acessado por `frutas[-1]` na lista `frutas = ["maçã", "banana", "laranja"]`?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: '"maçã"' },
        { id: 'opt2', text: '"banana"' },
        { id: 'opt3', text: '"laranja"' },
        { id: 'opt4', text: 'IndexError' },
      ]),
      correctAnswer: 'opt3',
      explanation: 'Índices negativos em Python acessam a lista a partir do final.',
    },
  ];

  for (const q of pythonQuestions) {
    await prisma.question.create({ data: q });
  }

  // 3. Subject 2: Física Básica
  const physicsSubject = await prisma.subject.create({
    data: {
      name: 'Física Básica',
      description: 'Cinemática, Dinâmica, Leis de Newton e Conservação de Energia.',
      teacherId: teacher.id,
    },
  });

  const kcPhysKin = await prisma.knowledgeComponent.create({
    data: {
      subjectId: physicsSubject.id,
      name: 'Cinemática e Movimento Uniforme',
      description: 'Velocidade média, deslocamento, função horária da posição.',
    },
  });

  const kcPhysNewton = await prisma.knowledgeComponent.create({
    data: {
      subjectId: physicsSubject.id,
      name: 'Leis de Newton e Força',
      description: 'Primeira, segunda e terceira leis de Newton, força resultante e atrito.',
    },
  });

  const physQuestions = [
    {
      subjectId: physicsSubject.id,
      kcId: kcPhysKin.id,
      statement:
        'Um veículo percorre uma distância de 150 km em 2 horas. Qual é a sua velocidade média?',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: '50 km/h' },
        { id: 'opt2', text: '75 km/h' },
        { id: 'opt3', text: '100 km/h' },
        { id: 'opt4', text: '300 km/h' },
      ]),
      correctAnswer: 'opt2',
      explanation: 'Velocidade média = deslocamento / tempo = 150 km / 2 h = 75 km/h.',
    },
    {
      subjectId: physicsSubject.id,
      kcId: kcPhysNewton.id,
      statement:
        'De acordo com a Segunda Lei de Newton, a aceleração de um corpo é diretamente proporcional a:',
      type: QuestionType.MULTIPLE_CHOICE,
      difficulty: Difficulty.EASY,
      optionsJson: JSON.stringify([
        { id: 'opt1', text: 'Sua massa' },
        { id: 'opt2', text: 'A força resultante aplicada sobre ele' },
        { id: 'opt3', text: 'Sua velocidade inicial' },
        { id: 'opt4', text: 'Sua energia potencial' },
      ]),
      correctAnswer: 'opt2',
      explanation: 'F = m * a, portanto a aceleração a = F / m.',
    },
  ];

  for (const q of physQuestions) {
    await prisma.question.create({ data: q });
  }

  console.log('✅ Created 2 Subjects, 7 Knowledge Components, 10 Questions');
  console.log('🎉 Teacher-only database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
