import React, { useState } from 'react';
import { QuestionDto } from '@escola/shared-types';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  FileCode,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from './ui/Button';
import { apiFetch } from '../lib/api';

interface BulkImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectId: string;
  kcId: string;
  questions: QuestionDto[];
  onImportSuccess: () => void;
}

interface ParsedImportQuestion {
  statement: string;
  type: 'MULTIPLE_CHOICE' | 'OPEN_TEXT';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options?: { id: string; text: string }[];
  correctAnswer: string;
  explanation?: string;
  imageUrl?: string;
  isValid: boolean;
  error?: string;
}

export function BulkImportExportModal({
  isOpen,
  onClose,
  subjectId,
  kcId,
  questions,
  onImportSuccess,
}: BulkImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedImportQuestion[]>([]);
  const [importing, setImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen) return null;

  // EXPORT HANDLERS
  const handleExportJSON = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `questoes_export_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportCSV = () => {
    const headers = [
      'enunciado',
      'dificuldade',
      'opcao_a',
      'opcao_b',
      'opcao_c',
      'opcao_d',
      'resposta_correta',
      'resolucao',
      'imagem_url',
    ];
    const rows = questions.map((q) => {
      const optA = q.options?.[0]?.text || '';
      const optB = q.options?.[1]?.text || '';
      const optC = q.options?.[2]?.text || '';
      const optD = q.options?.[3]?.text || '';
      const correctLetter = q.correctAnswer?.replace('opt', '') || '1';
      return [
        `"${q.statement.replace(/"/g, '""')}"`,
        q.difficulty,
        `"${optA.replace(/"/g, '""')}"`,
        `"${optB.replace(/"/g, '""')}"`,
        `"${optC.replace(/"/g, '""')}"`,
        `"${optD.replace(/"/g, '""')}"`,
        correctLetter,
        `"${(q.explanation || '').replace(/"/g, '""')}"`,
        `"${(q.imageUrl || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `questoes_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // IMPORT FILE PARSER
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage('');
    setSuccessMessage('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        if (file.name.endsWith('.json')) {
          parseJSON(content);
        } else if (file.name.endsWith('.csv')) {
          parseCSV(content);
        } else {
          setErrorMessage(
            'Formato de arquivo não suportado. Por favor, envie um arquivo .csv ou .json.'
          );
        }
      } catch (err: any) {
        setErrorMessage('Erro ao ler arquivo: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const parseJSON = (content: string) => {
    const raw = JSON.parse(content);
    const items = Array.isArray(raw) ? raw : [raw];
    const parsed: ParsedImportQuestion[] = items.map((q: any) => {
      const isValid = Boolean(q.statement && q.statement.length >= 5 && q.correctAnswer);
      return {
        statement: q.statement || '',
        type: q.type || 'MULTIPLE_CHOICE',
        difficulty: q.difficulty || 'MEDIUM',
        options: q.options || [
          { id: 'opt1', text: q.opcao_a || 'Opção A' },
          { id: 'opt2', text: q.opcao_b || 'Opção B' },
          { id: 'opt3', text: q.opcao_c || 'Opção C' },
          { id: 'opt4', text: q.opcao_d || 'Opção D' },
        ],
        correctAnswer: q.correctAnswer || 'opt1',
        explanation: q.explanation || '',
        imageUrl: q.imageUrl || '',
        isValid,
        error: !isValid ? 'Enunciado curto ou resposta correta ausente' : undefined,
      };
    });
    setParsedQuestions(parsed);
  };

  const parseCSV = (content: string) => {
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length <= 1) {
      setErrorMessage('O arquivo CSV está vazio ou possui apenas o cabeçalho.');
      return;
    }

    const dataRows = lines.slice(1);
    const parsed: ParsedImportQuestion[] = dataRows.map((line) => {
      // Basic CSV splitter respecting quotes
      const parts = line.match(/(?:"[^"]*"|[^,])+/g) || [];
      const cleanParts = parts.map((p) =>
        p
          .trim()
          .replace(/^"|"$/g, '')
          .replace(/""/g, '"')
      );

      const statement = cleanParts[0] || '';
      const difficulty = (cleanParts[1] as any) || 'MEDIUM';
      const optA = cleanParts[2] || '';
      const optB = cleanParts[3] || '';
      const optC = cleanParts[4] || '';
      const optD = cleanParts[5] || '';
      const ans = cleanParts[6] || '1';
      const explanation = cleanParts[7] || '';
      const imageUrl = cleanParts[8] || '';

      const isValid = statement.length >= 5 && optA.length > 0 && optB.length > 0;
      const optIdMap: Record<string, string> = {
        '1': 'opt1',
        '2': 'opt2',
        '3': 'opt3',
        '4': 'opt4',
        a: 'opt1',
        b: 'opt2',
        c: 'opt3',
        d: 'opt4',
      };

      return {
        statement,
        type: 'MULTIPLE_CHOICE',
        difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? difficulty : 'MEDIUM',
        options: [
          { id: 'opt1', text: optA },
          { id: 'opt2', text: optB },
          { id: 'opt3', text: optC },
          { id: 'opt4', text: optD },
        ].filter((o) => o.text.length > 0),
        correctAnswer: optIdMap[ans.toLowerCase()] || 'opt1',
        explanation,
        imageUrl,
        isValid,
        error: !isValid ? 'Linha CSV incompleta (verifique enunciado e opções)' : undefined,
      };
    });

    setParsedQuestions(parsed);
  };

  const handleConfirmImport = async () => {
    const validItems = parsedQuestions.filter((q) => q.isValid);
    if (validItems.length === 0) {
      setErrorMessage('Nenhuma questão válida para importar.');
      return;
    }

    if (!subjectId || !kcId) {
      setErrorMessage(
        'Selecione uma disciplina e um componente de conhecimento (KC) antes de importar.'
      );
      return;
    }

    setImporting(true);
    setErrorMessage('');

    try {
      const res = await apiFetch<{ importedCount: number; message: string }>('/questions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          subjectId,
          kcId,
          questions: validItems.map((q) => ({
            statement: q.statement,
            type: q.type,
            difficulty: q.difficulty,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || undefined,
            imageUrl: q.imageUrl || undefined,
          })),
        }),
      });

      setSuccessMessage(res.message || `${validItems.length} questões importadas com sucesso!`);
      setParsedQuestions([]);
      onImportSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao importar questões.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Importar / Exportar Questões
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gerencie o banco de questões em lote utilizando arquivos CSV ou JSON
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Banco ({questions.length})
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === 'import'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Importar em Lote
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {successMessage}
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Baixe todas as <strong>{questions.length}</strong> questões cadastradas nesta
                disciplina no formato de sua preferência para backup ou compartilhamento:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={handleExportCSV}
                  className="p-5 border rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <FileSpreadsheet className="w-8 h-8 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition" />
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">
                        Exportar para CSV
                      </h4>
                      <span className="text-xs text-slate-500">Excel / Planilhas Google</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gera uma planilha contendo enunciados, alternativas, gabaritos e resoluções.
                  </p>
                </div>

                <div
                  onClick={handleExportJSON}
                  className="p-5 border rounded-xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <FileCode className="w-8 h-8 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition" />
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">
                        Exportar para JSON
                      </h4>
                      <span className="text-xs text-slate-500">Estrutura Completa de Dados</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exporta objeto JSON estruturado nativo pronto para backup ou migração de
                    sistema.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-slate-50 dark:bg-slate-800/30 hover:border-blue-500 transition">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  Selecione um arquivo CSV ou JSON
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  Formatos suportados: .csv ou .json
                </p>
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                  id="bulk-file-input"
                />
                <label htmlFor="bulk-file-input">
                  <Button
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => document.getElementById('bulk-file-input')?.click()}
                  >
                    Escolher Arquivo
                  </Button>
                </label>
              </div>

              {parsedQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Pré-visualização da Importação (
                      {parsedQuestions.filter((q) => q.isValid).length} válidas de{' '}
                      {parsedQuestions.length})
                    </h4>
                    <Button onClick={handleConfirmImport} isLoading={importing}>
                      Confirmar Importação
                    </Button>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left text-slate-700 dark:text-slate-300">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="p-2">Status</th>
                          <th className="p-2">Enunciado</th>
                          <th className="p-2">Opções</th>
                          <th className="p-2">Gabarito</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {parsedQuestions.map((q, idx) => (
                          <tr
                            key={idx}
                            className={q.isValid ? '' : 'bg-red-50/50 dark:bg-red-950/30'}
                          >
                            <td className="p-2">
                              {q.isValid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <CheckCircle className="w-3.5 h-3.5" /> Válida
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold"
                                  title={q.error}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" /> Inválida
                                </span>
                              )}
                            </td>
                            <td className="p-2 truncate max-w-xs">{q.statement}</td>
                            <td className="p-2">{q.options?.length || 0} opc</td>
                            <td className="p-2 font-mono uppercase">{q.correctAnswer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
