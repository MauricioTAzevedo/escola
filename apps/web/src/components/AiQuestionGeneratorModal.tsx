import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../lib/api';
import { formatDifficulty } from '../lib/formatters';
import { Button } from './ui/Button';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { FormattedText } from './ui/FormattedText';
import { Sparkles, Check, X, AlertCircle, Eye, Pencil } from 'lucide-react';

interface DraftQuestion {
  statement: string;
  type: 'MULTIPLE_CHOICE' | 'OPEN_TEXT';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options?: Array<{ id: string; text: string }>;
  correctAnswer: string;
  explanation: string;
  isApproved: boolean;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectId: string;
  kcId: string;
  kcName: string;
  onQuestionsApproved: () => void;
}

export function AiQuestionGeneratorModal({
  isOpen,
  onClose,
  subjectId,
  kcId,
  kcName,
  onQuestionsApproved,
}: ModalProps) {
  const [rawText, setRawText] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(true);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!rawText.trim() || rawText.length < 20) {
      setError('Por favor, cole um texto de referência com pelo menos 20 caracteres.');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const res = await apiFetch<{ draftQuestions: DraftQuestion[] }>('/ai/generate-questions', {
        method: 'POST',
        body: JSON.stringify({
          rawText,
          kcName,
          difficulty,
          count,
        }),
      });

      setDrafts(res.draftQuestions);
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar questões com IA. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveAndPublish = async () => {
    if (drafts.length === 0) return;

    setIsPublishing(true);
    setError(null);

    try {
      for (const draft of drafts) {
        await apiFetch('/questions', {
          method: 'POST',
          body: JSON.stringify({
            subjectId,
            kcId,
            statement: draft.statement,
            type: draft.type,
            difficulty: draft.difficulty,
            options: draft.options,
            correctAnswer: draft.correctAnswer,
            explanation: draft.explanation,
            isApproved: true,
          }),
        });
      }

      onQuestionsApproved();
      onClose();
    } catch (err: any) {
      setError('Falha ao publicar algumas questões. Verifique as informações.');
    } finally {
      setIsPublishing(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gerar Rascunhos de Questões via IA</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Componente: <span className="font-semibold">{kcName}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-sm flex items-center">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {drafts.length === 0 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cole o Material ou Texto de Referência do Professor:
                </label>
                <textarea
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Cole aqui o trecho da aula, capítulo de livro, ou resumo sobre o qual a IA criará rascunhos de questões..."
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nível de Dificuldade:</label>
                  <select
                    value={difficulty}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDifficulty(e.target.value as any)}
                    className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="EASY">Fácil</option>
                    <option value="MEDIUM">Médio</option>
                    <option value="HARD">Difícil</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Quantidade de Questões:</label>
                  <div className="flex items-center space-x-2">
                    {[1, 3, 5, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCount(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          count === n
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={count}
                      onChange={(e) => setCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                      className="w-16 p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-300">
                <span className="flex items-center font-medium">
                  <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mr-1.5" />
                  Rascunhos gerados por IA. Revise e edite os enunciados antes de publicar!
                </span>
                <Button variant="outline" size="sm" onClick={() => setDrafts([])}>
                  Gerar Novamente
                </Button>
              </div>

              {drafts.map((draft, idx) => (
                <Card key={idx} className="border-l-4 border-l-amber-500">
                  <CardHeader className="py-3 px-4 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center space-x-2">
                      <Badge variant="warning">Rascunho #{idx + 1}</Badge>
                      <Badge variant="default">Dificuldade: {formatDifficulty(draft.difficulty)}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewMode(!previewMode)}
                      className="flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                    >
                      {previewMode ? (
                        <><Pencil className="h-3.5 w-3.5" /> <span>Editar</span></>
                      ) : (
                        <><Eye className="h-3.5 w-3.5" /> <span>Visualizar</span></>
                      )}
                    </button>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {/* Statement */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Enunciado da Questão:
                      </label>
                      {previewMode ? (
                        <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                          <FormattedText content={draft.statement} />
                        </div>
                      ) : (
                        <textarea
                          rows={3}
                          value={draft.statement}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                            const updated = [...drafts];
                            updated[idx].statement = e.target.value;
                            setDrafts(updated);
                          }}
                          className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-sm leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                        />
                      )}
                    </div>

                    {/* Options list */}
                    {draft.options && (
                      <div className="space-y-2.5">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Opções de Múltipla Escolha:
                        </label>
                        {draft.options.map((opt, optIdx) => (
                          <div key={opt.id} className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-5 flex-shrink-0">
                              {opt.id.replace('opt', '')}.
                            </span>
                            <div className="flex-1 relative">
                              {previewMode ? (
                                <div
                                  className={`px-3 py-2 text-sm border rounded-lg ${
                                    draft.correctAnswer === opt.id
                                      ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/40 pr-24 font-medium text-emerald-950 dark:text-emerald-200'
                                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100'
                                  }`}
                                >
                                  <FormattedText content={opt.text} />
                                  {draft.correctAnswer === opt.id && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 rounded-md pointer-events-none">
                                      ✓ Correta
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                      const updated = [...drafts];
                                      updated[idx].options![optIdx].text = e.target.value;
                                      setDrafts(updated);
                                    }}
                                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
                                      draft.correctAnswer === opt.id
                                        ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/40 pr-24 font-medium text-emerald-950 dark:text-emerald-200'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                                    }`}
                                  />
                                  {draft.correctAnswer === opt.id && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 rounded-md pointer-events-none">
                                      ✓ Correta
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Explanation preview */}
                    {draft.explanation && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Resolução Passo a Passo:
                        </label>
                        {previewMode ? (
                          <div className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                            <FormattedText content={draft.explanation} />
                          </div>
                        ) : (
                          <textarea
                            rows={3}
                            value={draft.explanation}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                              const updated = [...drafts];
                              updated[idx].explanation = e.target.value;
                              setDrafts(updated);
                            }}
                            className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-sm leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end space-x-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>

          {drafts.length === 0 ? (
            <Button variant="primary" onClick={handleGenerate} isLoading={isGenerating}>
              <Sparkles className="h-4 w-4 mr-2" />
              Gerar Rascunhos via IA
            </Button>
          ) : (
            <Button variant="primary" onClick={handleApproveAndPublish} isLoading={isPublishing}>
              <Check className="h-4 w-4 mr-2" />
              Aprovar e Publicar Questões ({drafts.length})
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
