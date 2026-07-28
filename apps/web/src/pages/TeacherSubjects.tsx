import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { SubjectDto, KnowledgeComponentDto, QuestionDto } from '@escola/shared-types';
import { formatDifficulty } from '../lib/formatters';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { FormattedText } from '../components/ui/FormattedText';
import { AiQuestionGeneratorModal } from '../components/AiQuestionGeneratorModal';
import { ExamPdfModal } from '../components/ExamPdfModal';
import { InstitutionSettingsModal } from '../components/InstitutionSettingsModal';
import {
  Plus,
  Trash2,
  Sparkles,
  BookOpen,
  Layers,
  HelpCircle,
  CheckCircle2,
  Pencil,
  FileText,
  Copy,
  Search,
  X as XIcon,
  Building2,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export function TeacherSubjects() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s: any) => s.user);
  const [activeTab, setActiveTab] = useState<'subjects' | 'kcs' | 'questions'>('subjects');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Modals / Form States — Create
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');

  const [isKcModalOpen, setIsKcModalOpen] = useState(false);
  const [newKcName, setNewKcName] = useState('');
  const [newKcDesc, setNewKcDesc] = useState('');

  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [selectedKcForQuestion, setSelectedKcForQuestion] = useState('');
  const [questionStatement, setQuestionStatement] = useState('');
  const [questionDifficulty, setQuestionDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>(
    'MEDIUM'
  );
  const [opt1, setOpt1] = useState('');
  const [opt2, setOpt2] = useState('');
  const [opt3, setOpt3] = useState('');
  const [opt4, setOpt4] = useState('');
  const [correctOpt, setCorrectOpt] = useState('opt1');
  const [explanation, setExplanation] = useState('');

  // Edit question state
  const [editingQuestion, setEditingQuestion] = useState<QuestionDto | null>(null);

  // AI Modal
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiKcId, setAiKcId] = useState('');
  const [aiKcName, setAiKcName] = useState('');

  // PDF Modal & Institution Modal
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isInstitutionModalOpen, setIsInstitutionModalOpen] = useState(false);

  // Search & Filter state
  const [searchText, setSearchText] = useState('');
  const [filterKcId, setFilterKcId] = useState<string>('ALL');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('ALL');
  const [filterSource, setFilterSource] = useState<string>('ALL');

  // Queries
  const { data: subjects = [] } = useQuery<SubjectDto[]>({
    queryKey: ['subjects'],
    queryFn: () => apiFetch('/subjects'),
  });

  const currentSubjectId = selectedSubjectId || (subjects.length > 0 ? subjects[0].id : '');
  const currentSubjectName = subjects.find((s) => s.id === currentSubjectId)?.name || '';

  const { data: kcs = [] } = useQuery<KnowledgeComponentDto[]>({
    queryKey: ['kcs', currentSubjectId],
    queryFn: () => apiFetch(`/kcs?subjectId=${currentSubjectId}`),
    enabled: !!currentSubjectId,
  });

  const { data: questions = [] } = useQuery<QuestionDto[]>({
    queryKey: ['questions', currentSubjectId],
    queryFn: () => apiFetch(`/questions?subjectId=${currentSubjectId}`),
    enabled: !!currentSubjectId,
  });

  // Mutations
  const createSubjectMutation = useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      apiFetch('/subjects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setIsSubjectModalOpen(false);
      setNewSubName('');
      setNewSubDesc('');
    },
  });

  const createKcMutation = useMutation({
    mutationFn: (body: { subjectId: string; name: string; description?: string }) =>
      apiFetch('/kcs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kcs', currentSubjectId] });
      setIsKcModalOpen(false);
      setNewKcName('');
      setNewKcDesc('');
    },
  });

  const createQuestionMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch('/questions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', currentSubjectId] });
      closeQuestionModal();
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', currentSubjectId] });
      closeQuestionModal();
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', currentSubjectId] });
    },
  });

  const duplicateQuestionMutation = useMutation({
    mutationFn: (q: QuestionDto) =>
      apiFetch('/questions', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: currentSubjectId,
          kcId: q.kcId,
          statement: q.statement + ' (Cópia)',
          type: q.type || 'MULTIPLE_CHOICE',
          difficulty: q.difficulty,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          isApproved: true,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions', currentSubjectId] });
    },
  });

  // Filtered questions (search + filters)
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchText =
        !searchText ||
        q.statement.toLowerCase().includes(searchText.toLowerCase()) ||
        q.kcName?.toLowerCase().includes(searchText.toLowerCase());
      const matchKc = filterKcId === 'ALL' || q.kcId === filterKcId;
      const matchDiff = filterDifficulty === 'ALL' || q.difficulty === filterDifficulty;
      const matchSrc =
        filterSource === 'ALL' ||
        (filterSource === 'AI' && q.isAiGenerated) ||
        (filterSource === 'MANUAL' && !q.isAiGenerated);
      return matchText && matchKc && matchDiff && matchSrc;
    });
  }, [questions, searchText, filterKcId, filterDifficulty, filterSource]);
  const openCreateQuestion = () => {
    setEditingQuestion(null);
    setQuestionStatement('');
    setOpt1('');
    setOpt2('');
    setOpt3('');
    setOpt4('');
    setCorrectOpt('opt1');
    setExplanation('');
    setQuestionDifficulty('MEDIUM');
    setSelectedKcForQuestion(kcs[0]?.id || '');
    setIsQuestionModalOpen(true);
  };

  const openEditQuestion = (q: QuestionDto) => {
    setEditingQuestion(q);
    setQuestionStatement(q.statement);
    setOpt1(q.options?.[0]?.text || '');
    setOpt2(q.options?.[1]?.text || '');
    setOpt3(q.options?.[2]?.text || '');
    setOpt4(q.options?.[3]?.text || '');
    setCorrectOpt(q.correctAnswer || 'opt1');
    setExplanation(q.explanation || '');
    setQuestionDifficulty((q.difficulty as any) || 'MEDIUM');
    setSelectedKcForQuestion(q.kcId);
    setIsQuestionModalOpen(true);
  };

  const closeQuestionModal = () => {
    setIsQuestionModalOpen(false);
    setEditingQuestion(null);
  };

  const handleCreateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    createSubjectMutation.mutate({ name: newSubName, description: newSubDesc });
  };

  const handleCreateKc = (e: React.FormEvent) => {
    e.preventDefault();
    createKcMutation.mutate({
      subjectId: currentSubjectId,
      name: newKcName,
      description: newKcDesc,
    });
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      subjectId: currentSubjectId,
      kcId: selectedKcForQuestion || (kcs[0] ? kcs[0].id : ''),
      statement: questionStatement,
      type: 'MULTIPLE_CHOICE',
      difficulty: questionDifficulty,
      options: [
        { id: 'opt1', text: opt1 },
        { id: 'opt2', text: opt2 },
        { id: 'opt3', text: opt3 },
        { id: 'opt4', text: opt4 },
      ],
      correctAnswer: correctOpt,
      explanation,
    };

    if (editingQuestion) {
      updateQuestionMutation.mutate({ id: editingQuestion.id, body });
    } else {
      createQuestionMutation.mutate(body);
    }
  };

  const isQuestionSaving = createQuestionMutation.isPending || updateQuestionMutation.isPending;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Gestão de Conteúdo e Questões
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Cadastre disciplinas, defina Componentes de Conhecimento e gerencie o banco de questões.
          </p>
        </div>

        {/* Subject Selector */}
        {subjects.length > 0 && (
          <select
            value={currentSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-indigo-500"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center space-x-2 ${
            activeTab === 'subjects'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('subjects')}
        >
          <BookOpen className="h-4 w-4" />
          <span>Disciplinas ({subjects.length})</span>
        </button>

        <button
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center space-x-2 ${
            activeTab === 'kcs'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('kcs')}
        >
          <Layers className="h-4 w-4" />
          <span>Componentes de Conhecimento ({kcs.length})</span>
        </button>

        <button
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center space-x-2 ${
            activeTab === 'questions'
              ? 'border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('questions')}
        >
          <HelpCircle className="h-4 w-4" />
          <span>Banco de Questões ({questions.length})</span>
        </button>
      </div>

      {/* TAB 1: DISCIPLINAS */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setIsSubjectModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Nova Disciplina
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((sub) => (
              <Card key={sub.id}>
                <CardHeader>
                  <CardTitle>{sub.name}</CardTitle>
                  <CardDescription>{sub.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div>KCs Mapeados: {sub.kcCount ?? 0}</div>
                  <div>Questões Cadastradas: {sub.questionCount ?? 0}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: COMPONENTES DE CONHECIMENTO */}
      {activeTab === 'kcs' && (
        <div className="space-y-4">
          <div className="flex justify-end space-x-3">
            <Button
              variant="primary"
              onClick={() => setIsKcModalOpen(true)}
              disabled={!currentSubjectId}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Componente (KC)
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {kcs.map((kc) => (
              <Card key={kc.id} className="p-4 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-bold text-slate-900 dark:text-slate-100">{kc.name}</h4>
                    <Badge variant="info">KC</Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{kc.description}</p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAiKcId(kc.id);
                    setAiKcName(kc.name);
                    setIsAiModalOpen(true);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
                  Gerar Questões com IA
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: BANCO DE QUESTÕES */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {/* Top action bar */}
          <div className="flex justify-end items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => setIsInstitutionModalOpen(true)}
              title="Configurar Nome e Logo da Escola"
            >
              <Building2 className="h-4 w-4 mr-2 text-indigo-600 dark:text-indigo-400" />
              Instituição (Logo/Nome)
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsPdfModalOpen(true)}
              disabled={questions.length === 0}
            >
              <FileText className="h-4 w-4 mr-2 text-indigo-600 dark:text-indigo-400" />
              Gerar Prova PDF
            </Button>
            <Button variant="primary" onClick={openCreateQuestion} disabled={kcs.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Questão Manual
            </Button>
          </div>

          {/* Search & Filter bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar por enunciado ou KC..."
                className="w-full pl-9 pr-8 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter row */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  KC:
                </label>
                <select
                  value={filterKcId}
                  onChange={(e) => setFilterKcId(e.target.value)}
                  className="p-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Todos</option>
                  {kcs.map((kc) => (
                    <option key={kc.id} value={kc.id}>
                      {kc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Dificuldade:
                </label>
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value)}
                  className="p-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Todas</option>
                  <option value="EASY">Fácil</option>
                  <option value="MEDIUM">Médio</option>
                  <option value="HARD">Difícil</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Origem:
                </label>
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="p-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Todas</option>
                  <option value="AI">IA</option>
                  <option value="MANUAL">Manual</option>
                </select>
              </div>

              {/* Results count + clear */}
              <div className="ml-auto flex items-center space-x-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredQuestions.length} de {questions.length} questão(ões)
                </span>
                {(searchText ||
                  filterKcId !== 'ALL' ||
                  filterDifficulty !== 'ALL' ||
                  filterSource !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSearchText('');
                      setFilterKcId('ALL');
                      setFilterDifficulty('ALL');
                      setFilterSource('ALL');
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Question cards */}
          <div className="space-y-4">
            {filteredQuestions.length === 0 && (
              <div className="text-center py-10 text-sm text-slate-400">
                Nenhuma questão encontrada.
              </div>
            )}
            {filteredQuestions.map((q) => (
              <Card key={q.id}>
                <CardHeader className="py-3 px-4 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                  <div className="flex items-center space-x-2 flex-wrap gap-1">
                    <Badge variant="info">{q.kcName}</Badge>
                    <Badge variant="default">Dificuldade: {formatDifficulty(q.difficulty)}</Badge>
                    {q.isAiGenerated && <Badge variant="warning">Gerado via IA</Badge>}
                  </div>
                  <div className="flex items-center space-x-1">
                    {/* Duplicate button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateQuestionMutation.mutate(q)}
                      title="Duplicar questão"
                      isLoading={duplicateQuestionMutation.isPending}
                    >
                      <Copy className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </Button>
                    {/* Edit button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditQuestion(q)}
                      title="Editar questão"
                    >
                      <Pencil className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                    </Button>
                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          window.confirm('Tem certeza de que deseja excluir esta questão do banco?')
                        ) {
                          deleteQuestionMutation.mutate(q.id);
                        }
                      }}
                      title="Excluir questão do banco"
                      isLoading={deleteQuestionMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Statement */}
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                    <FormattedText content={q.statement} />
                  </div>

                  {/* Options */}
                  {q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {q.options.map((opt) => (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-lg border flex items-center justify-between ${
                            q.correctAnswer === opt.id
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 font-medium text-emerald-900 dark:text-emerald-300'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center space-x-1">
                            <strong className="mr-1">{opt.id.replace('opt', '')}.</strong>
                            <FormattedText content={opt.text} />
                          </span>
                          {q.correctAnswer === opt.id && (
                            <span className="flex items-center text-[11px] font-bold text-emerald-700 dark:text-emerald-400 ml-2 flex-shrink-0">
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Correta
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Resolução Passo a Passo */}
                  {q.explanation && (
                    <div className="p-3.5 bg-indigo-50/70 dark:bg-slate-800/80 rounded-xl border border-indigo-100 dark:border-slate-700/80 space-y-1.5 text-xs">
                      <div className="flex items-center space-x-1.5 font-bold text-indigo-900 dark:text-indigo-300">
                        <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                        <span>Resolução Passo a Passo &amp; Resultado Final:</span>
                      </div>
                      <div className="text-slate-700 dark:text-slate-300 leading-relaxed pl-5">
                        <FormattedText content={q.explanation} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Nova Disciplina */}
      {isSubjectModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Nova Disciplina
              </h3>
              <form onSubmit={handleCreateSubject} className="space-y-3">
                <Input
                  label="Nome da Disciplina"
                  required
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                />
                <Input
                  label="Descrição"
                  value={newSubDesc}
                  onChange={(e) => setNewSubDesc(e.target.value)}
                />
                <div className="flex justify-end space-x-2 pt-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setIsSubjectModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    isLoading={createSubjectMutation.isPending}
                  >
                    Salvar
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Novo Componente (KC) */}
      {isKcModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Novo Componente de Conhecimento (KC)
              </h3>
              <form onSubmit={handleCreateKc} className="space-y-3">
                <Input
                  label="Nome do KC"
                  required
                  value={newKcName}
                  onChange={(e) => setNewKcName(e.target.value)}
                />
                <Input
                  label="Descrição"
                  value={newKcDesc}
                  onChange={(e) => setNewKcDesc(e.target.value)}
                />
                <div className="flex justify-end space-x-2 pt-2">
                  <Button variant="ghost" type="button" onClick={() => setIsKcModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" isLoading={createKcMutation.isPending}>
                    Salvar
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal: Criar / Editar Questão */}
      {isQuestionModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-xl w-full my-8 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {editingQuestion ? '✏️ Editar Questão' : 'Cadastrar Nova Questão'}
                </h3>
                {editingQuestion && <Badge variant="warning">Editando</Badge>}
              </div>
              <form onSubmit={handleSaveQuestion} className="space-y-3">
                {/* KC selector */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Componente de Conhecimento (KC):
                  </label>
                  <select
                    value={selectedKcForQuestion}
                    onChange={(e) => setSelectedKcForQuestion(e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {kcs.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Difficulty */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nível de Dificuldade:
                  </label>
                  <select
                    value={questionDifficulty}
                    onChange={(e) => setQuestionDifficulty(e.target.value as any)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="EASY">Fácil</option>
                    <option value="MEDIUM">Médio</option>
                    <option value="HARD">Difícil</option>
                  </select>
                </div>

                {/* Statement */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Enunciado (aceita LaTeX $...$ e código ```python ... ```):
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={questionStatement}
                    onChange={(e) => setQuestionStatement(e.target.value)}
                    placeholder="Enunciado com fórmulas $E=mc^2$ ou blocos de código..."
                    className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Options */}
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Opções de Múltipla Escolha:
                  </label>
                  <Input
                    label="Opção 1 (opt1)"
                    required
                    value={opt1}
                    onChange={(e) => setOpt1(e.target.value)}
                  />
                  <Input
                    label="Opção 2 (opt2)"
                    required
                    value={opt2}
                    onChange={(e) => setOpt2(e.target.value)}
                  />
                  <Input
                    label="Opção 3 (opt3)"
                    required
                    value={opt3}
                    onChange={(e) => setOpt3(e.target.value)}
                  />
                  <Input
                    label="Opção 4 (opt4)"
                    required
                    value={opt4}
                    onChange={(e) => setOpt4(e.target.value)}
                  />
                </div>

                {/* Correct answer */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Opção Correta:
                  </label>
                  <select
                    value={correctOpt}
                    onChange={(e) => setCorrectOpt(e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="opt1">Opção 1</option>
                    <option value="opt2">Opção 2</option>
                    <option value="opt3">Opção 3</option>
                    <option value="opt4">Opção 4</option>
                  </select>
                </div>

                {/* Explanation */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Passo a Passo de Resolução &amp; Resultado Final:
                  </label>
                  <textarea
                    rows={3}
                    placeholder="1) Dados... 2) Fórmula $$F = m \cdot a$$... 3) Resultado: 50 N"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <Button variant="ghost" type="button" onClick={closeQuestionModal}>
                    Cancelar
                  </Button>
                  <Button variant="primary" type="submit" isLoading={isQuestionSaving}>
                    {editingQuestion ? 'Salvar Alterações' : 'Salvar Questão'}
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* AI Question Generator Modal */}
      <AiQuestionGeneratorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        subjectId={currentSubjectId}
        kcId={aiKcId}
        kcName={aiKcName}
        onQuestionsApproved={() => {
          queryClient.invalidateQueries({ queryKey: ['questions', currentSubjectId] });
        }}
      />

      {/* PDF Export Modal */}
      <ExamPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        questions={questions}
        subjectName={currentSubjectName}
        teacherName={user?.name || ''}
      />

      {/* Institution Settings Modal */}
      <InstitutionSettingsModal
        isOpen={isInstitutionModalOpen}
        onClose={() => setIsInstitutionModalOpen(false)}
      />
    </div>
  );
}
