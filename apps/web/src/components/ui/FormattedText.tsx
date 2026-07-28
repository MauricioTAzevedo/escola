import React from 'react';
import katex from 'katex';
import { Terminal, Copy, Check } from 'lucide-react';

interface FormattedTextProps {
  content: string;
  className?: string;
}

export function FormattedText({ content, className = '' }: FormattedTextProps) {
  if (!content) return null;

  // Pre-process: fix Delta symbols, wrap orphaned LaTeX in $...$
  const normalizedContent = fixAllMathAndDeltaSymbols(content);

  // Process fenced code blocks ```lang ... ```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(normalizedContent)) !== null) {
    const textBefore = normalizedContent.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderTextWithSteps(textBefore, `text-${lastIndex}`));
    }
    const lang = match[1] || 'code';
    const code = match[2].trim();
    parts.push(<CodeBlock key={`code-${match.index}`} code={code} language={lang} />);
    lastIndex = match.index + match[0].length;
  }

  const remainingText = normalizedContent.substring(lastIndex);
  if (remainingText) {
    parts.push(renderTextWithSteps(remainingText, `text-${lastIndex}`));
  }

  return <div className={`space-y-1 ${className}`}>{parts}</div>;
}

// ---------------------------------------------------------------------------
// Step splitting: detect "1) ...", "2) ..." patterns and render each as a
// visually distinct step block with number badge + indented content.
// Falls back to inline math rendering if no steps are detected.
// ---------------------------------------------------------------------------
function renderTextWithSteps(text: string, keyPrefix: string): React.ReactNode {
  // Match step patterns like "1) ", "2) ", "3) ", or "Passo 1:", "Etapa 2:" etc.
  // Split on boundaries where a new step starts.
  const stepRegex = /(?:^|\.\s*)(\d+)\)\s*/g;
  const steps: Array<{ num: string; content: string }> = [];
  let lastEnd = 0;
  let preamble = '';
  let m: RegExpExecArray | null;

  // Reset regex
  stepRegex.lastIndex = 0;

  while ((m = stepRegex.exec(text)) !== null) {
    if (steps.length === 0) {
      // Text before the first step marker is "preamble"
      preamble = text
        .substring(0, m.index)
        .replace(/\.\s*$/, '')
        .trim();
    } else {
      // Close the previous step's content
      const prevContent = text
        .substring(lastEnd, m.index)
        .replace(/\.\s*$/, '')
        .trim();
      steps[steps.length - 1].content = prevContent;
    }
    steps.push({ num: m[1], content: '' });
    lastEnd = m.index + m[0].length;
  }

  // If fewer than 2 steps detected, render normally (no step formatting)
  if (steps.length < 2) {
    return renderInlineMath(text, keyPrefix);
  }

  // Close the last step
  steps[steps.length - 1].content = text
    .substring(lastEnd)
    .replace(/\.\s*$/, '')
    .trim();

  return (
    <div key={keyPrefix} className="space-y-2">
      {preamble && (
        <div className="text-sm text-slate-700 dark:text-slate-300 mb-1">
          {renderInlineMath(preamble, `${keyPrefix}-pre`)}
        </div>
      )}
      <div className="space-y-1.5 pl-1">
        {steps.map((step, i) => (
          <div
            key={`${keyPrefix}-step-${i}`}
            className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border-l-2 border-indigo-400/60 dark:border-indigo-500/40"
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center mt-0.5">
              {step.num}
            </span>
            <div className="flex-1 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {renderInlineMath(step.content, `${keyPrefix}-step-${i}`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-processing: fix Delta text → \Delta symbol, wrap orphaned LaTeX in $...$
// ---------------------------------------------------------------------------
function fixAllMathAndDeltaSymbols(text: string): string {
  if (!text) return text;
  let s = text;

  // 1. Normalize Delta variants to proper \Delta
  s = s.replace(/\\text\{Delta\}/gi, '\\Delta');
  s = s.replace(/(?<!\\)\bDelta\b/g, '\\Delta');
  // Clean artifact "\ \Command" → "\Command"
  s = s.replace(/\\\s+\\/g, '\\');

  // 2. Flatten display math $$ → inline $
  s = s.replace(/\$\$\s*([^$]+?)\s*\$\$/g, (_, expr) => `$${expr.trim()}$`);

  // 3. Split text into "already-in-math" ($...$) and "plain text" segments
  const segments: Array<{ text: string; isMath: boolean }> = [];
  const dollarRegex = /\$([^\$]*)\$/g;
  let dm;
  let lastIdx = 0;

  while ((dm = dollarRegex.exec(s)) !== null) {
    if (dm.index > lastIdx) {
      segments.push({ text: s.substring(lastIdx, dm.index), isMath: false });
    }
    // Fix Delta inside existing math too
    const innerFixed = dm[1].replace(/(?<!\\)\bDelta\b/g, '\\Delta');
    segments.push({ text: `$${innerFixed}$`, isMath: true });
    lastIdx = dm.index + dm[0].length;
  }
  if (lastIdx < s.length) {
    segments.push({ text: s.substring(lastIdx), isMath: false });
  }

  // 4. In plain-text segments, find orphaned LaTeX commands and wrap in $...$
  return segments
    .map((seg) => {
      if (seg.isMath) return seg.text;
      return wrapOrphanedLatex(seg.text);
    })
    .join('');
}

function wrapOrphanedLatex(text: string): string {
  // Match: \LaTeXCommand followed by math-like characters,
  // stopping before ". " (period + whitespace = sentence/step boundary).
  // This captures expressions like: \Delta T_C / 5 = \Delta T_F / 9
  return text.replace(
    /\\(?:Delta|cdot|frac|sqrt|times|pm|circ|text)\b(?:(?!\.\s)[\s\S])*/g,
    (match) => {
      let trimmed = match.trim();
      // Remove trailing punctuation that isn't part of math
      trimmed = trimmed.replace(/[.,;:]+$/, '').trim();
      if (!trimmed) return match;
      const leadingSpaces = match.match(/^\s*/)?.[0] || '';
      return `${leadingSpaces}$${trimmed}$`;
    }
  );
}

// ---------------------------------------------------------------------------
// Code Block component
// ---------------------------------------------------------------------------
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 text-slate-100 shadow-sm font-mono text-xs">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800/90 border-b border-slate-700 text-slate-400">
        <span className="flex items-center space-x-1.5 font-bold uppercase text-[11px] text-indigo-400">
          <Terminal className="h-3.5 w-3.5" />
          <span>{language}</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 text-[11px] text-slate-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto leading-relaxed selection:bg-indigo-500 selection:text-white">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline math ($...$) and inline code (`...`) rendering via KaTeX
// ---------------------------------------------------------------------------
function renderInlineMath(text: string, keyPrefix: string): React.ReactNode {
  // Match inline math $...$ or inline code `...`
  const inlineRegex = /(\$([^\$]+)\$)|(`([^`]+)`)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    const textBefore = text.substring(lastIdx, match.index);
    if (textBefore) {
      nodes.push(<span key={`${keyPrefix}-txt-${lastIdx}`}>{textBefore}</span>);
    }

    if (match[1]) {
      // Inline Math $...$
      const mathStr = match[2];
      try {
        const html = katex.renderToString(mathStr, {
          displayMode: false,
          throwOnError: false,
        });
        nodes.push(
          <span
            key={`${keyPrefix}-imath-${match.index}`}
            className="inline-block px-0.5 font-normal"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      } catch {
        nodes.push(<span key={`${keyPrefix}-imath-${match.index}`}>{`$${mathStr}$`}</span>);
      }
    } else if (match[3]) {
      // Inline Code `...`
      const codeStr = match[4];
      nodes.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-mono text-xs"
        >
          {codeStr}
        </code>
      );
    }

    lastIdx = match.index + match[0].length;
  }

  const remaining = text.substring(lastIdx);
  if (remaining) {
    nodes.push(<span key={`${keyPrefix}-txt-${lastIdx}`}>{remaining}</span>);
  }

  return <React.Fragment key={keyPrefix}>{nodes}</React.Fragment>;
}
