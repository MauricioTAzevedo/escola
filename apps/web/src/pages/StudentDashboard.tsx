import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Brain, Flame, CheckCircle, Target, Clock } from 'lucide-react';

interface MasteryData {
  kcId: string;
  kcName: string;
  subjectName: string;
  pMastery: number;
  totalAttempts: number;
  correctAttempts: number;
  lastUpdated: string;
}

interface AttemptData {
  id: string;
  questionStatement: string;
  kcName: string;
  isCorrect: boolean;
  previousPL: number;
  newPL: number;
  createdAt: string;
}

interface DashboardResponse {
  masteries: MasteryData[];
  recentAttempts: AttemptData[];
}

export function StudentDashboard() {
  const { data, isLoading, isError } = useQuery<DashboardResponse>({
    queryKey: ['student-dashboard'],
    queryFn: () => apiFetch('/study/dashboard'),
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm font-medium text-slate-600">Carregando mapa de conhecimento e métricas de desempenho...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <Card className="p-8">
          <p className="text-sm text-slate-600">Não foi possível carregar os dados do dashboard.</p>
        </Card>
      </div>
    );
  }

  const { masteries, recentAttempts } = data;

  // Compute summary metrics
  const totalAttemptsCount = recentAttempts.length;
  const correctAttemptsCount = recentAttempts.filter((a) => a.isCorrect).length;
  const avgMastery =
    masteries.length > 0
      ? Math.round((masteries.reduce((sum, m) => sum + m.pMastery, 0) / masteries.length) * 100)
      : 0;

  // Format data for Recharts Radar chart
  const radarData = masteries.map((m) => ({
    kc: m.kcName.length > 18 ? m.kcName.substring(0, 18) + '...' : m.kcName,
    fullKc: m.kcName,
    dominio: Math.round(m.pMastery * 100),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Seu Dashboard de Aprendizado</h1>
        <p className="text-sm text-slate-600">
          Acompanhe seu nível de domínio por Componente de Conhecimento e histórico recente de estudos.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Brain className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Média Geral de Domínio</div>
            <div className="text-2xl font-bold text-slate-900">{avgMastery}%</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Taxa de Acertos Recente</div>
            <div className="text-2xl font-bold text-slate-900">
              {totalAttemptsCount > 0 ? Math.round((correctAttemptsCount / totalAttemptsCount) * 100) : 0}%
            </div>
          </div>
        </Card>

        <Card className="p-5 flex items-center space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Sequência de Estudos</div>
            <div className="text-2xl font-bold text-slate-900">3 Dias Seguidos</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center space-x-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Componentes Mapeados</div>
            <div className="text-2xl font-bold text-slate-900">{masteries.length} KCs</div>
          </div>
        </Card>
      </div>

      {/* Visualizations Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Gráfico Radar de Domínio por KC</CardTitle>
            <CardDescription>Visão multidimensional das suas habilidades mapeadas pelo BKT</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex items-center justify-center">
            {radarData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="kc" tick={{ fill: '#475569', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#94a3b8" />
                  <Radar
                    name="Domínio (%)"
                    dataKey="dominio"
                    stroke="#4f46e5"
                    fill="#6366f1"
                    fillOpacity={0.4}
                  />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'Domínio BKT']} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">Nenhum dado de domínio suficiente ainda.</p>
            )}
          </CardContent>
        </Card>

        {/* Progress Bars per KC */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Componente de Conhecimento</CardTitle>
            <CardDescription>Probabilidade BKT de maestria $P(L)$ por tópico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-h-80 overflow-y-auto pr-2">
            {masteries.map((m) => (
              <div key={m.kcId} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800">{m.kcName}</span>
                  <span className="text-slate-500">{m.subjectName}</span>
                </div>
                <ProgressBar value={m.pMastery} size="md" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico Recente de Respostas</CardTitle>
          <CardDescription>Log detalhado de auditoria de questões e atualização de domínio</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Data/Hora</th>
                  <th className="px-4 py-3">Questão</th>
                  <th className="px-4 py-3">Componente (KC)</th>
                  <th className="px-4 py-3 text-center">Resultado</th>
                  <th className="px-4 py-3 text-right">Evolução BKT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500 flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" />
                      {new Date(att.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-xs truncate">
                      {att.questionStatement}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{att.kcName}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={att.isCorrect ? 'success' : 'danger'}>
                        {att.isCorrect ? 'Correto' : 'Incorreto'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-mono font-medium">
                      <span className={att.newPL >= att.previousPL ? 'text-emerald-600' : 'text-rose-600'}>
                        {Math.round(att.previousPL * 100)}% → {Math.round(att.newPL * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
