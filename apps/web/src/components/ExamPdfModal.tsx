import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  PDFDownloadLink,
  PDFViewer,
} from '@react-pdf/renderer';
import { QuestionDto } from '@escola/shared-types';
import { X, FileText, Download, CheckSquare, Square, Filter, Eye, Shuffle, Building2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatDifficulty } from '../lib/formatters';
import { loadInstitutionSettings, InstitutionSettingsModal } from './InstitutionSettingsModal';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stripMath(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\Delta/g, 'Δ').replace(/\\delta/g, 'δ')
    .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ').replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π').replace(/\\sigma/g, 'σ')
    .replace(/\\omega/g, 'ω').replace(/\\phi/g, 'φ')
    .replace(/\\cdot/g, '·').replace(/\\times/g, '×')
    .replace(/\\pm/g, '±').replace(/\\approx/g, '≈')
    .replace(/\\neq/g, '≠').replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥').replace(/\\infty/g, '∞')
    .replace(/\^\{?\\circ\}?/g, '°').replace(/\\circ/g, '°')
    .replace(/\^2/g, '²').replace(/\^3/g, '³')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)').replace(/\\sqrt/g, '√')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\^\{([^}]+)\}/g, '^$1')
    .replace(/\_\{([^}]+)\}/g, '$1')
    .replace(/\\left|\\right|\\big|\\Big/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\{|\}/g, '')
    .replace(/```[\w]*\n?/g, '').replace(/`/g, '')
    .replace(/\s+/g, ' ').trim();
}

function getOptionLabel(idx: number): string {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  return letters[idx] ? `${letters[idx]})` : `${idx + 1})`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleOptions(q: QuestionDto): QuestionDto {
  if (!q.options || q.options.length === 0) return q;
  const shuffled = shuffleArray(q.options);
  const correctText = q.options.find((o) => o.id === q.correctAnswer)?.text;
  const newOptions = shuffled.map((o, i) => ({ ...o, id: `opt${i + 1}` }));
  const newCorrect = newOptions.find((o) => o.text === correctText)?.id || q.correctAnswer;
  return { ...q, options: newOptions, correctAnswer: newCorrect };
}

// ---------------------------------------------------------------------------
// PDF Styles (Academic & Clean)
// ---------------------------------------------------------------------------
const pdfStyles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 10, color: '#0f172a', lineHeight: 1.4 },
  
  // Header Table
  headerContainer: {
    border: '1.5pt solid #1e293b',
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottom: '1pt solid #cbd5e1',
    paddingBottom: 8,
    marginBottom: 8,
    gap: 12,
  },
  logo: { width: 48, height: 48, objectFit: 'contain' },
  headerTitleArea: { flex: 1 },
  schoolTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0f172a', textTransform: 'uppercase' },
  schoolSubtitle: { fontSize: 8.5, color: '#475569', marginTop: 1 },
  examMainTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1e40af', marginTop: 2 },
  
  // Header Meta Info Box
  metaGrid: { gap: 6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 9.5 },
  metaField: { flex: 1 },
  metaLabel: { fontFamily: 'Helvetica-Bold', color: '#334155' },
  lineFill: { color: '#64748b' },

  // Instructions
  instructions: {
    fontSize: 8.5,
    color: '#475569',
    fontStyle: 'italic',
    marginBottom: 14,
    padding: 6,
    backgroundColor: '#f8fafc',
    borderLeft: '2pt solid #3b82f6',
  },

  // Question Block
  questionBlock: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: '0.5pt solid #e2e8f0',
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 4,
  },
  questionNum: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: '#1e293b',
  },
  questionText: {
    fontSize: 10,
    color: '#0f172a',
    flex: 1,
    lineHeight: 1.5,
  },

  // Options List
  optionsList: {
    marginTop: 6,
    marginLeft: 16,
    gap: 3,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  optionLetter: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: '#334155',
    width: 14,
  },
  optionContent: {
    fontSize: 9.5,
    color: '#1e293b',
    flex: 1,
    lineHeight: 1.4,
  },

  // Answer Grid
  answerGridContainer: {
    marginTop: 16,
    paddingTop: 10,
    borderTop: '1.5pt solid #1e293b',
  },
  answerGridTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  answerGridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  answerBox: {
    width: 38,
    height: 32,
    border: '1pt solid #94a3b8',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 2,
  },
  answerBoxNum: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: '#475569',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justify: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderTop: '0.5pt solid #cbd5e1',
    paddingTop: 4,
  },
});

// ---------------------------------------------------------------------------
// PDF Document Component
// ---------------------------------------------------------------------------
interface ExamPdfDocumentProps {
  title: string;
  subject: string;
  className: string;
  date: string;
  teacher: string;
  questions: QuestionDto[];
  showAnswerKey: boolean;
  version?: string;
  institution: { schoolName: string; schoolSubtitle: string; logoDataUrl: string };
}

const ExamPdfDocument = ({
  title, subject, className, date, teacher, questions, showAnswerKey, version, institution,
}: ExamPdfDocumentProps) => (
  <Document title={title} author={teacher}>
    <Page size="A4" style={pdfStyles.page}>
      {/* Header Container */}
      <View style={pdfStyles.headerContainer}>
        <View style={pdfStyles.headerTopRow}>
          {institution.logoDataUrl && (
            <Image src={institution.logoDataUrl} style={pdfStyles.logo} />
          )}
          <View style={pdfStyles.headerTitleArea}>
            <Text style={pdfStyles.schoolTitle}>
              {institution.schoolName || 'INSTITUIÇÃO DE ENSINO'}
            </Text>
            {institution.schoolSubtitle && (
              <Text style={pdfStyles.schoolSubtitle}>{institution.schoolSubtitle}</Text>
            )}
            <Text style={pdfStyles.examMainTitle}>
              {title.toUpperCase()} {version ? `(VERSÃO ${version})` : ''} — {subject.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Student and Exam Meta Info */}
        <View style={pdfStyles.metaGrid}>
          <View style={pdfStyles.metaRow}>
            <Text style={{ flex: 2 }}>
              <Text style={pdfStyles.metaLabel}>Aluno(a): </Text>
              <Text style={pdfStyles.lineFill}>____________________________________________________</Text>
            </Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>
              <Text style={pdfStyles.metaLabel}>Turma: </Text>
              <Text>{className || '________'}</Text>
            </Text>
          </View>

          <View style={pdfStyles.metaRow}>
            <Text style={{ flex: 1 }}>
              <Text style={pdfStyles.metaLabel}>Prof.(a): </Text>
              <Text>{teacher || '____________________'}</Text>
            </Text>
            <Text style={{ flex: 1, textAlign: 'center' }}>
              <Text style={pdfStyles.metaLabel}>Data: </Text>
              <Text>{date || '__/__/____'}</Text>
            </Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>
              <Text style={pdfStyles.metaLabel}>Nota: </Text>
              <Text style={pdfStyles.lineFill}>__________</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Instructions */}
      <View style={pdfStyles.instructions}>
        <Text>
          Orientação: Assinale com clareza a alternativa correta para cada questão. Evite rasuras.
        </Text>
      </View>

      {/* Questions */}
      {questions.map((q, idx) => (
        <View key={q.id} style={pdfStyles.questionBlock} wrap={false}>
          <View style={pdfStyles.questionHeader}>
            <Text style={pdfStyles.questionNum}>{idx + 1}. </Text>
            <Text style={pdfStyles.questionText}>{stripMath(q.statement)}</Text>
          </View>
          {q.options && q.options.length > 0 && (
            <View style={pdfStyles.optionsList}>
              {q.options.map((opt, optIdx) => (
                <View key={opt.id} style={pdfStyles.optionRow}>
                  <Text style={pdfStyles.optionLetter}>{getOptionLabel(optIdx)}</Text>
                  <Text style={pdfStyles.optionContent}>{stripMath(opt.text)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {/* Answer Grid Box at bottom */}
      <View style={pdfStyles.answerGridContainer} wrap={false}>
        <Text style={pdfStyles.answerGridTitle}>FOLHA DE RESPOSTAS</Text>
        <View style={pdfStyles.answerGridRow}>
          {questions.map((_, idx) => (
            <View key={idx} style={pdfStyles.answerBox}>
              <Text style={pdfStyles.answerBoxNum}>{idx + 1}</Text>
              <Text style={{ fontSize: 8, color: '#cbd5e1' }}>(   )</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={pdfStyles.footer} fixed>
        <Text>{title}{version ? ` (Versão ${version})` : ''} · {subject}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>

    {/* Answer key page */}
    {showAnswerKey && (
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerContainer}>
          <Text style={pdfStyles.schoolTitle}>GABARITO E RESOLUÇÕES</Text>
          <Text style={pdfStyles.examMainTitle}>{title} {version ? `(Versão ${version})` : ''}</Text>
        </View>
        {questions.map((q, idx) => (
          <View key={q.id} style={{ marginBottom: 10 }} wrap={false}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: '#0f172a' }}>
              Questão {idx + 1}: {q.options?.find((o) => o.id === q.correctAnswer)
                ? `(${q.correctAnswer?.replace('opt', '')}) ${stripMath(q.options.find((o) => o.id === q.correctAnswer)!.text)}`
                : q.correctAnswer}
            </Text>
            {q.explanation && (
              <Text style={{ fontSize: 8.5, color: '#475569', marginTop: 2, fontStyle: 'italic' }}>
                Resolução: {stripMath(q.explanation)}
              </Text>
            )}
          </View>
        ))}
      </Page>
    )}
  </Document>
);
// ---------------------------------------------------------------------------
// Modal UI
// ---------------------------------------------------------------------------

type DiffFilter = 'ALL' | 'EASY' | 'MEDIUM' | 'HARD';

interface ExamPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuestionDto[];
  subjectName: string;
  teacherName?: string;
}

export function ExamPdfModal({ isOpen, onClose, questions, subjectName, teacherName = '' }: ExamPdfModalProps) {
  const [institution, setInstitution] = useState(loadInstitutionSettings);
  const [isInstitutionModalOpen, setIsInstitutionModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInstitution(loadInstitutionSettings());
    }
  }, [isOpen]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('Avaliação');
  const [className, setClassName] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('pt-BR'));
  const [teacher, setTeacher] = useState(teacherName);
  const [showAnswerKey, setShowAnswerKey] = useState(true);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('ALL');
  const [multipleVersions, setMultipleVersions] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  const filtered = useMemo(
    () => questions.filter((q: QuestionDto) => diffFilter === 'ALL' || q.difficulty === diffFilter),
    [questions, diffFilter]
  );

  const selectedQuestions = useMemo(
    () => questions.filter((q: QuestionDto) => selected.has(q.id)),
    [questions, selected]
  );

  // Version B: shuffle question order AND options
  const versionBQuestions = useMemo(() => {
    const shuffledQ = shuffleArray(selectedQuestions);
    return shuffledQ.map(shuffleOptions);
  }, [selectedQuestions]);

  const toggleAll = () => {
    if (filtered.every((q: QuestionDto) => selected.has(q.id))) {
      const next = new Set(selected);
      filtered.forEach((q: QuestionDto) => next.delete(q.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((q: QuestionDto) => next.add(q.id));
      setSelected(next);
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  if (!isOpen) return null;

  const allFilteredSelected = filtered.length > 0 && filtered.every((q: QuestionDto) => selected.has(q.id));
  const canGenerate = selectedQuestions.length > 0 && title.trim();

  const docPropsBase = {
    title, subject: subjectName, className, date, teacher,
    showAnswerKey, institution,
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full my-8 overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-slate-800">

        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Gerar Prova em PDF</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure, selecione questões e baixe</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Config content - now takes up all remaining space */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
            {/* LEFT: Settings */}
            <div className="w-full lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-5 space-y-4 overflow-y-auto">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">📋 Configurações da Prova</h4>

              {/* Institution Card with direct edit button */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Instituição</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsInstitutionModalOpen(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {institution.schoolName ? 'Editar' : '+ Cadastrar'}
                  </button>
                </div>
                {institution.schoolName ? (
                  <div className="flex items-center space-x-2">
                    {institution.logoDataUrl && (
                      <img src={institution.logoDataUrl} alt="" className="h-6 w-6 object-contain" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{institution.schoolName}</p>
                      {institution.schoolSubtitle && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{institution.schoolSubtitle}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sem logo ou nome cadastrado. Clique em cadastrar para incluir no PDF.
                  </p>
                )}
              </div>


              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Título da Prova*</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: 1ª Avaliação Bimestral"
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Turma</label>
                <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Ex: 3º Ano A"
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Data</label>
                <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Ex: 25/07/2026"
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Professor(a)</label>
                <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Nome do professor"
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center space-x-2">
                  <input id="answerKey" type="checkbox" checked={showAnswerKey} onChange={(e) => setShowAnswerKey(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <label htmlFor="answerKey" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    Incluir gabarito (página extra)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input id="multiVer" type="checkbox" checked={multipleVersions} onChange={(e) => setMultipleVersions(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  <label htmlFor="multiVer" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer flex items-center space-x-1">
                    <Shuffle className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Gerar Versão A e B (anti-cola)</span>
                  </label>
                </div>
              </div>

              {multipleVersions && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-100 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                  <strong>Versão A:</strong> Ordem original<br/>
                  <strong>Versão B:</strong> Questões e alternativas embaralhadas
                </div>
              )}

              {/* Summary */}
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-xl p-3 space-y-1 border border-indigo-100 dark:border-indigo-900">
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">Resumo</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-400">{selectedQuestions.length} questão(ões) selecionada(s)</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-400">
                  Fáceis: {selectedQuestions.filter((q: QuestionDto) => q.difficulty === 'EASY').length} ·{' '}
                  Médias: {selectedQuestions.filter((q: QuestionDto) => q.difficulty === 'MEDIUM').length} ·{' '}
                  Difíceis: {selectedQuestions.filter((q: QuestionDto) => q.difficulty === 'HARD').length}
                </p>
              </div>
            </div>

            {/* RIGHT: Question selector */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Filter bar */}
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Filtrar:</span>
                  {(['ALL', 'EASY', 'MEDIUM', 'HARD'] as DiffFilter[]).map((d) => (
                    <button key={d} onClick={() => setDiffFilter(d)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${diffFilter === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                      {d === 'ALL' ? 'Todos' : formatDifficulty(d)}
                    </button>
                  ))}
                </div>
                <button onClick={toggleAll} className="flex items-center space-x-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
                  {allFilteredSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  <span>{allFilteredSelected ? 'Desmarcar todos' : 'Selecionar todos'}</span>
                </button>
              </div>

              {/* Question list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-sm text-slate-400">Nenhuma questão para este filtro.</div>
                )}
                {filtered.map((q: QuestionDto) => {
                  const isChecked = selected.has(q.id);
                  return (
                    <div key={q.id} onClick={() => toggle(q.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                        isChecked
                          ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800/40'
                      }`}>
                      <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                        {isChecked && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant={q.difficulty === 'EASY' ? 'success' : q.difficulty === 'HARD' ? 'danger' : 'warning'}>
                            {formatDifficulty(q.difficulty)}
                          </Badge>
                          <Badge variant="info">{q.kcName}</Badge>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                          {q.statement.replace(/\$[^$]*\$/g, '[fórmula]').replace(/```[\s\S]*?```/g, '[código]')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>


        {/* Fullscreen PDF preview portal */}
        {showFullPreview && canGenerate && createPortal(
          <div className="fixed inset-0 z-[99999] flex flex-col bg-slate-900">
            {/* Preview toolbar */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowFullPreview(false)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>Fechar Preview</span>
                </button>
                <span className="text-white font-semibold text-sm">{title} — Preview (Versão A)</span>
              </div>
              <div className="flex items-center space-x-2">
                <PDFDownloadLink
                  document={<ExamPdfDocument {...docPropsBase} questions={selectedQuestions} version={multipleVersions ? 'A' : undefined} />}
                  fileName={`${title.toLowerCase().replace(/\s+/g, '_')}_${multipleVersions ? 'versao_a_' : ''}${subjectName.toLowerCase().replace(/\s+/g, '_')}.pdf`}
                >
                  {({ loading }) => (
                    <button className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors" disabled={loading}>
                      <Download className="h-4 w-4" />
                      <span>{loading ? 'Gerando...' : multipleVersions ? 'Versão A' : 'Baixar PDF'}</span>
                    </button>
                  )}
                </PDFDownloadLink>
                {multipleVersions && (
                  <PDFDownloadLink
                    document={<ExamPdfDocument {...docPropsBase} questions={versionBQuestions} version="B" />}
                    fileName={`${title.toLowerCase().replace(/\s+/g, '_')}_versao_b_${subjectName.toLowerCase().replace(/\s+/g, '_')}.pdf`}
                  >
                    {({ loading }) => (
                      <button className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors" disabled={loading}>
                        <Shuffle className="h-4 w-4" />
                        <span>{loading ? 'Gerando...' : 'Versão B'}</span>
                      </button>
                    )}
                  </PDFDownloadLink>
                )}
              </div>
            </div>
            {/* Full-screen PDF viewer */}
            <div className="flex-1 min-h-0">
              <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
                <ExamPdfDocument
                  {...docPropsBase}
                  questions={selectedQuestions}
                  version={multipleVersions ? 'A' : undefined}
                />
              </PDFViewer>
            </div>
          </div>,
          document.body
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center flex-shrink-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {selectedQuestions.length} de {questions.length} questões selecionadas
          </p>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>

            {canGenerate ? (
              <div className="flex items-center space-x-2">
                {/* Preview fullscreen button */}
                <Button
                  variant="outline"
                  onClick={() => setShowFullPreview(true)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Visualizar PDF
                </Button>

                {/* Version A download */}
                <PDFDownloadLink
                  document={
                    <ExamPdfDocument
                      {...docPropsBase}
                      questions={selectedQuestions}
                      version={multipleVersions ? 'A' : undefined}
                    />
                  }
                  fileName={`${title.toLowerCase().replace(/\s+/g, '_')}_${multipleVersions ? 'versao_a_' : ''}${subjectName.toLowerCase().replace(/\s+/g, '_')}.pdf`}
                >
                  {({ loading }) => (
                    <Button variant="primary" isLoading={loading}>
                      <Download className="h-4 w-4 mr-2" />
                      {loading ? 'Gerando...' : multipleVersions ? `Versão A (${selectedQuestions.length}q)` : `Baixar PDF (${selectedQuestions.length}q)`}
                    </Button>
                  )}
                </PDFDownloadLink>

                {/* Version B (only when multiple versions enabled) */}
                {multipleVersions && (
                  <PDFDownloadLink
                    document={
                      <ExamPdfDocument
                        {...docPropsBase}
                        questions={versionBQuestions}
                        version="B"
                      />
                    }
                    fileName={`${title.toLowerCase().replace(/\s+/g, '_')}_versao_b_${subjectName.toLowerCase().replace(/\s+/g, '_')}.pdf`}
                  >
                    {({ loading }) => (
                      <Button variant="outline" isLoading={loading}>
                        <Shuffle className="h-4 w-4 mr-2" />
                        {loading ? 'Gerando...' : `Versão B (embaralhada)`}
                      </Button>
                    )}
                  </PDFDownloadLink>
                )}
              </div>
            ) : (
              <Button variant="primary" disabled>
                <Download className="h-4 w-4 mr-2" />
                Selecione questões e defina um título
              </Button>
            )}
          </div>
        </div>
      </div>

      <InstitutionSettingsModal
        isOpen={isInstitutionModalOpen}
        onClose={() => {
          setIsInstitutionModalOpen(false);
          setInstitution(loadInstitutionSettings());
        }}
      />
    </div>,
    document.body
  );
}

