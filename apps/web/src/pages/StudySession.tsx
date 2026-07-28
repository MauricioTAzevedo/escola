import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { QuestionDto, SubmitAnswerResponse } from '@escola/shared-types';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';
import { CheckCircle2, XCircle, Sparkles, ArrowRight, Brain, ArrowLeft } from 'lucide-react';

export function StudySession() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: question,
    isLoading,
    isError,
    refetch,
  } = useQuery<QuestionDto>({
    queryKey: ['next-question', subjectId],
    queryFn: () => apiFetch(`/study/next-question?subjectId=${subjectId}`),
    refetchOnWindowFocus: false,
  });

  const handleSubmit = async () => {
    if (!question) return;

    setIsSubmitting(true);

    try {
      const res = await apiFetch<SubmitAnswerResponse>('/study/answer', {
        method: 'POST',
        body: JSON.stringify({
          questionId: question.id,
          selectedOptionId: selectedOptionId || undefined,
          textAnswer: textAnswer || undefined,
        }),
      });

      setResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    setResult(null);
    setSelectedOptionId(null);
    setTextAnswer('');
    refetch();
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-600">
          O algoritmo BKT está selecionando a questão adaptativa ideal para seu momento de aprendizado...
        </p>
      </div>
    );
  }

  if (isError || !question) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <Card className="p-8">
          <Brain className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">Sessão Concluída ou Sem Questões</h3>
          <p className="text-sm text-slate-600 mb-6">
            Não há questões adaptativas disponíveis para este tópico no momento.
          </p>
          <Button variant="outline" onClick={() => navigate('/student/subjects')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Disciplinas
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/student/subjects')}
          className="flex items-center text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar às Disciplinas
        </button>

        <div className="flex items-center space-x-2">
          <Badge variant="info">KC: {question.kcName}</Badge>
          <Badge variant="default">Dificuldade: {question.difficulty}</Badge>
        </div>
      </div>

      {/* Question Card */}
      <Card className="border-t-4 border-t-indigo-600">
        <CardHeader>
          <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
            <span>Questão Adaptativa</span>
            <span className="flex items-center text-indigo-600 font-medium">
              <Brain className="h-3.5 w-3.5 mr-1" />
              Seleção por BKT Engine
            </span>
          </div>
          <CardTitle className="text-xl leading-relaxed text-slate-900">
            {question.statement}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {question.type === 'MULTIPLE_CHOICE' && question.options && (
            <div className="space-y-2.5">
              {question.options.map((option) => {
                const isSelected = selectedOptionId === option.id;
                let optionStyle = 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50';

                if (result) {
                  if (isSelected && result.isCorrect) {
                    optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium';
                  } else if (isSelected && !result.isCorrect) {
                    optionStyle = 'border-rose-500 bg-rose-50 text-rose-900';
                  }
                } else if (isSelected) {
                  optionStyle = 'border-indigo-600 bg-indigo-50 text-indigo-900 font-medium ring-1 ring-indigo-600';
                }

                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={result !== null}
                    onClick={() => setSelectedOptionId(option.id)}
                    className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-start space-x-3 ${optionStyle}`}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-semibold">
                      {option.id.replace('opt', '')}
                    </span>
                    <span className="flex-1 mt-0.5">{option.text}</span>
                  </button>
                );
              })}
            </div>
          )}

          {question.type === 'OPEN_TEXT' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">Sua Resposta por Extenso:</label>
              <textarea
                rows={4}
                disabled={result !== null}
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                placeholder="Escreva sua resposta ou explicação aqui..."
                className="w-full p-3 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}
        </CardContent>

        {!result && (
          <CardFooter className="flex justify-end">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              disabled={!selectedOptionId && !textAnswer.trim()}
            >
              Confirmar Resposta
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Immediate Feedback Card */}
      {result && (
        <div className="space-y-4 animate-fadeIn">
          <Card className={`border-l-4 ${result.isCorrect ? 'border-l-emerald-500 bg-emerald-50/50' : 'border-l-rose-500 bg-rose-50/50'}`}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start space-x-3">
                {result.isCorrect ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-6 w-6 text-rose-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className={`text-base font-bold ${result.isCorrect ? 'text-emerald-900' : 'text-rose-900'}`}>
                    {result.isCorrect ? 'Resposta Correta! Excelente desempenho.' : 'Resposta Incorreta. Não desanime!'}
                  </h4>
                  {!result.isCorrect && (
                    <p className="text-sm text-slate-700 mt-1">
                      <strong>Resposta Esperada:</strong> {result.correctAnswerText}
                    </p>
                  )}
                </div>
              </div>

              {/* BKT Mastery Delta Indicator */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Atualização do Modelo de Conhecimento (BKT)</span>
                  <span className={result.newPL >= result.previousPL ? 'text-emerald-600' : 'text-rose-600'}>
                    {Math.round(result.previousPL * 100)}% → {Math.round(result.newPL * 100)}% ({result.newPL >= result.previousPL ? '+' : ''}
                    {Math.round((result.newPL - result.previousPL) * 100)}%)
                  </span>
                </div>
                <ProgressBar value={result.newPL} size="md" />
              </div>

              {/* AI Explanation Card */}
              {result.aiExplanation && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-indigo-900">
                    <Sparkles className="h-4 w-4 text-indigo-600" />
                    <span>Explicação Personalizada por IA (Google Gemini)</span>
                  </div>
                  <p className="text-sm text-indigo-950 leading-relaxed">
                    {result.aiExplanation}
                  </p>
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-between items-center bg-white border-t border-slate-100">
              <span className="text-xs text-slate-500">Pronto para o próximo desafio?</span>
              <Button variant="primary" onClick={handleNextQuestion}>
                <span>Próxima Questão Adaptativa</span>
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
