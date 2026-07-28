import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  Download,
  HelpCircle,
  Layers,
  Sparkles,
  TrendingUp,
  Target,
  BarChart2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface KcCoverage {
  kcId: string;
  kcName: string;
  questionCount: number;
}

interface AnalyticsResponse {
  subjects: Array<{ id: string; name: string }>;
  activeSubjectId: string;
  totalQuestions: number;
  totalKcs: number;
  aiGeneratedCount: number;
  manualCount: number;
  difficultyStats: { EASY: number; MEDIUM: number; HARD: number };
  kcCoverage: KcCoverage[];
}

const DIFF_COLORS = {
  Fácil: '#10b981',
  Médio: '#f59e0b',
  Difícil: '#ef4444',
};

export function TeacherDashboard() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  const { data, isLoading, isError } = useQuery<AnalyticsResponse>({
    queryKey: ['teacher-analytics', selectedSubjectId],
    queryFn: () =>
      apiFetch(`/teacher/analytics${selectedSubjectId ? `?subjectId=${selectedSubjectId}` : ''}`),
  });

  const activeSubId = selectedSubjectId || (data ? data.activeSubjectId : '');

  const handleDownloadCsv = () => {
    if (!activeSubId) return;
    const token = localStorage.getItem('token');
    const url = `/api/teacher/export-csv?subjectId=${activeSubId}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `banco_questoes_disciplina.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Carregando métricas...
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <Card className="p-8">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Não foi possível carregar o dashboard.
          </p>
        </Card>
      </div>
    );
  }

  const {
    subjects,
    totalQuestions,
    totalKcs,
    aiGeneratedCount,
    manualCount,
    difficultyStats,
    kcCoverage,
  } = data;

  // Difficulty bar chart data
  const difficultyChartData = [
    {
      name: 'Fácil',
      value: difficultyStats.EASY,
      pct: totalQuestions ? Math.round((difficultyStats.EASY / totalQuestions) * 100) : 0,
    },
    {
      name: 'Médio',
      value: difficultyStats.MEDIUM,
      pct: totalQuestions ? Math.round((difficultyStats.MEDIUM / totalQuestions) * 100) : 0,
    },
    {
      name: 'Difícil',
      value: difficultyStats.HARD,
      pct: totalQuestions ? Math.round((difficultyStats.HARD / totalQuestions) * 100) : 0,
    },
  ];

  // KC coverage bar chart - top 8 for readability
  const kcChartData = [...kcCoverage]
    .sort((a, b) => b.questionCount - a.questionCount)
    .slice(0, 8)
    .map((kc) => ({
      name: kc.kcName.length > 22 ? kc.kcName.substring(0, 22) + '…' : kc.kcName,
      fullName: kc.kcName,
      questões: kc.questionCount,
    }));

  const kcsWithQuestions = kcCoverage.filter((kc) => kc.questionCount > 0).length;
  const coveragePct = totalKcs > 0 ? Math.round((kcsWithQuestions / totalKcs) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Visão Geral do Banco de Questões
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Distribuição por dificuldade, cobertura de componentes e métricas gerais.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={activeSubId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 font-medium"
          >
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="md" onClick={handleDownloadCsv}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Total de Questões
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {totalQuestions}
              </p>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <HelpCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            <span>
              {aiGeneratedCount} via IA · {manualCount} manuais
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Comp. de Conhecimento
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalKcs}</p>
            </div>
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 rounded-xl">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {kcsWithQuestions} com questões · {totalKcs - kcsWithQuestions} sem
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Geradas por IA
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {aiGeneratedCount}
              </p>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {totalQuestions > 0 ? Math.round((aiGeneratedCount / totalQuestions) * 100) : 0}% do
            total
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Cobertura de KCs
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {coveragePct}%
              </p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Target className="h-5 w-5" />
            </div>
          </div>
          {/* Mini progress bar */}
          <div className="mt-3">
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${coveragePct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {kcsWithQuestions}/{totalKcs} KCs cobertos
            </p>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Difficulty Bar Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <BarChart2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <CardTitle>Distribuição por Dificuldade</CardTitle>
            </div>
            <CardDescription>Quantidade e percentual de questões por nível</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {totalQuestions > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={difficultyChartData}
                  margin={{ top: 16, right: 16, left: -8, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-slate-200 dark:stroke-slate-700"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: 'currentColor' }}
                    className="text-slate-600 dark:text-slate-400"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-slate-500 dark:text-slate-500"
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} questões (${props.payload.pct}%)`,
                      'Total',
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={80}>
                    {difficultyChartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={DIFF_COLORS[entry.name as keyof typeof DIFF_COLORS]}
                      />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      style={{ fontSize: '12px', fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-400">Nenhuma questão cadastrada ainda.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* KC Coverage Bar Chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <BarChart2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <CardTitle>Questões por Componente de Conhecimento</CardTitle>
            </div>
            <CardDescription>
              Top {Math.min(8, kcCoverage.length)} KCs por quantidade de questões
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {kcCoverage.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={kcChartData}
                  layout="vertical"
                  margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    className="stroke-slate-200 dark:stroke-slate-700"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-slate-500 dark:text-slate-500"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    className="text-slate-600 dark:text-slate-400"
                  />
                  <Tooltip
                    formatter={(value: number, _: string, props: any) => [
                      `${value} questões`,
                      props.payload.fullName,
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="questões" radius={[0, 6, 6, 0]} maxBarSize={24} fill="#8b5cf6">
                    <LabelList
                      dataKey="questões"
                      position="right"
                      style={{ fontSize: '11px', fontWeight: 600, fill: '#8b5cf6' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-slate-400">Nenhum KC cadastrado ainda.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KC Coverage Detail Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Detalhamento de Cobertura por KC</CardTitle>
              <CardDescription>
                Todos os componentes e suas respectivas quantidades de questões
              </CardDescription>
            </div>
            <Badge
              variant={coveragePct >= 80 ? 'success' : coveragePct >= 50 ? 'warning' : 'danger'}
            >
              {coveragePct}% de cobertura
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-2">
            {kcCoverage.map((kc) => {
              const pct =
                totalQuestions > 0 ? Math.round((kc.questionCount / totalQuestions) * 100) : 0;
              return (
                <div
                  key={kc.kcId}
                  className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {kc.kcName}
                    </span>
                    <Badge
                      variant={kc.questionCount > 0 ? 'success' : 'warning'}
                      className="flex-shrink-0"
                    >
                      {kc.questionCount}
                    </Badge>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full transition-all duration-500 ${kc.questionCount > 0 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                      style={{ width: `${Math.min(pct * 3, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {kc.questionCount === 0
                      ? 'Sem questões — precisa de atenção'
                      : `${pct}% das questões totais`}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
