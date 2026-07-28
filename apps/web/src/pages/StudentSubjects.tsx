import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { SubjectDto } from '@escola/shared-types';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { BookOpen, Layers, HelpCircle, ArrowRight } from 'lucide-react';

export function StudentSubjects() {
  const navigate = useNavigate();

  const { data: subjects, isLoading, error } = useQuery<SubjectDto[]>({
    queryKey: ['subjects'],
    queryFn: () => apiFetch('/subjects'),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Disciplinas de Estudo</h1>
          <p className="text-sm text-slate-600">
            Selecione uma disciplina para iniciar uma sessão de estudo com seleção adaptativa de questões.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 bg-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm">
          Falha ao carregar a lista de disciplinas. Verifique sua conexão.
        </div>
      )}

      {subjects && subjects.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <BookOpen className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">Nenhuma disciplina disponível</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
            Seu professor ainda não cadastrou nenhuma disciplina.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {subjects?.map((sub) => (
          <Card key={sub.id} className="flex flex-col justify-between hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="info">Disciplina</Badge>
                <div className="flex items-center text-xs text-slate-500 space-x-3">
                  <span className="flex items-center">
                    <Layers className="h-3.5 w-3.5 mr-1" />
                    {sub.kcCount ?? 0} KCs
                  </span>
                  <span className="flex items-center">
                    <HelpCircle className="h-3.5 w-3.5 mr-1" />
                    {sub.questionCount ?? 0} Questões
                  </span>
                </div>
              </div>
              <CardTitle>{sub.name}</CardTitle>
              <CardDescription className="line-clamp-2">{sub.description}</CardDescription>
            </CardHeader>

            <CardFooter className="flex justify-between items-center bg-slate-50">
              <span className="text-xs text-slate-500">Prática Adaptativa BKT</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/student/study/${sub.id}`)}
              >
                <span>Iniciar Estudo</span>
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
