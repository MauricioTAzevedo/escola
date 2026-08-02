import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  IAiTutorService,
  AiExplanationResponseSchema,
  AiFeedbackResponseSchema,
  DraftQuestionListSchema,
  DraftQuestion,
} from './types';
import { AiCacheService } from './AiCacheService';
import { RateLimiter } from './RateLimiter';

function extractJsonObjectSubstring(raw: string): string {
  let cleaned = raw.trim();

  // Strip ```json ... ``` markdown wrappers if present
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Find the first '{' and then walk forward tracking brace depth,
  // respecting JSON strings so that braces inside string values are ignored.
  const start = cleaned.indexOf('{');
  if (start === -1) return cleaned;

  let depth = 0;
  let inString = false;
  let i = start;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (inString) {
      if (ch === '\\') {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    // Outside a string
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        // Found the matching closing brace for the top-level object
        return cleaned.substring(start, i + 1);
      }
    }
    i++;
  }

  // Fallback: if we never balanced, return from first brace to end
  return cleaned.substring(start);
}

/**
 * Walk the JSON string character by character. Inside string values,
 * distinguish LaTeX commands (\Delta, \text, \frac — 2+ letters after \)
 * from valid single-char JSON escapes (\n, \t, \", \\, etc.).
 * LaTeX backslashes get doubled so JSON.parse treats them as literal \.
 */
function fixJsonBackslashes(jsonStr: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;

  while (i < jsonStr.length) {
    const ch = jsonStr[i];

    if (!inString) {
      if (ch === '"') inString = true;
      out.push(ch);
      i++;
      continue;
    }

    // Inside a JSON string value
    if (ch === '"') {
      // Unescaped quote → end of string
      inString = false;
      out.push(ch);
      i++;
    } else if (ch === '\\') {
      if (i + 1 >= jsonStr.length) {
        out.push('\\\\');
        i++;
        continue;
      }

      const next = jsonStr[i + 1];

      // Count how many consecutive ASCII letters follow the backslash
      let wordEnd = i + 1;
      while (wordEnd < jsonStr.length && /[a-zA-Z]/.test(jsonStr[wordEnd])) wordEnd++;
      const wordLen = wordEnd - (i + 1);

      if (wordLen >= 2) {
        // 2+ letters → LaTeX command (\Delta, \text, \frac, \cdot …)
        // Double the backslash so JSON sees it as a literal \
        out.push('\\\\');
        i++; // advance past the \, letters will be output in subsequent iterations
      } else if (
        next === 'u' &&
        i + 5 < jsonStr.length &&
        /^[0-9a-fA-F]{4}$/.test(jsonStr.substring(i + 2, i + 6))
      ) {
        // \uXXXX unicode escape — valid JSON
        out.push(jsonStr.substring(i, i + 6));
        i += 6;
      } else if ('"\\\/bfnrtu'.includes(next) && wordLen <= 1) {
        // Valid single-char JSON escape (\", \\, \/, \b, \f, \n, \r, \t)
        out.push(ch);
        out.push(next);
        i += 2;
      } else {
        // Unknown single-char escape → double it to be safe
        out.push('\\\\');
        i++;
      }
    } else {
      out.push(ch);
      i++;
    }
  }

  return out.join('');
}

function safeParseGeminiJson<T>(raw: string): T {
  const jsonStr = extractJsonObjectSubstring(raw);
  // Always fix LaTeX backslashes BEFORE parsing.
  // \text → \\text, \Delta → \\Delta, etc.
  // Without this, \t in \text is parsed as a tab character by JSON.parse.
  const fixed = fixJsonBackslashes(jsonStr);
  return JSON.parse(fixed) as T;
}

export class GeminiAiTutorService implements IAiTutorService {
  private genAI: GoogleGenerativeAI | null = null;
  private rateLimiter = new RateLimiter(12, 60000); // 12 RPM limit (safely under 15 RPM free tier)

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'your-gemini-api-key-here') {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  private getCandidateModels(): string[] {
    const userModel = process.env.GEMINI_MODEL;
    const defaults = [
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash',
    ];
    if (userModel && !defaults.includes(userModel)) {
      return [userModel, ...defaults];
    }
    return defaults;
  }

  private async generateContentWithFallback(prompt: string): Promise<string> {
    if (!this.genAI) {
      throw new Error('Chave de API do Gemini não configurada.');
    }

    const modelsToTry = this.getCandidateModels();
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' },
        });

        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ Modelo ${modelName} falhou (${err.message}). Tentando próximo modelo...`);
      }
    }

    throw lastError || new Error('Nenhum modelo Gemini respondeu com sucesso.');
  }

  async generateExplanation(
    questionStatement: string,
    studentAnswer: string,
    correctAnswer: string,
    kcName: string,
    currentPL: number
  ): Promise<string> {
    const cacheKey = [
      'explanation',
      questionStatement,
      studentAnswer,
      correctAnswer,
      kcName,
      Math.round(currentPL * 10).toString(),
    ];

    const cached = await AiCacheService.getCachedResponse(cacheKey);
    if (cached) return cached;

    const staticFallback = `Análise pedagógica para "${kcName}": A resposta correta é "${correctAnswer}". Revise o enunciado e tente identificar onde o raciocínio divergiu para fortalecer seu domínio (${Math.round(currentPL * 100)}%).`;

    if (!this.genAI || !this.rateLimiter.tryAcquire()) return staticFallback;

    try {
      const prompt = `
Você é um tutor pedagógico adaptativo profissional.
Responda sempre em português do Brasil (pt-BR), em tom profissional, claro e encorajador.

Contexto do Aluno:
- Componente de Conhecimento: "${kcName}"
- Nível de Domínio Atual BKT: ${Math.round(currentPL * 100)}%
- Enunciado da Questão: "${questionStatement}"
- Resposta enviada pelo aluno: "${studentAnswer}"
- Resposta correta esperada: "${correctAnswer}"

Instruções:
Explique de forma curta e direta (máximo 3 frases) por que a resposta do aluno está incorreta e como raciocinar corretamente para chegar à resposta certa.

Responda exclusivamente no seguinte formato JSON:
{
  "explanation": "sua explicação pedagógica em pt-BR aqui",
  "keyTakeaway": "conceito-chave em uma frase curta"
}
      `;

      const text = await this.generateContentWithFallback(prompt);
      const parsed = safeParseGeminiJson<any>(text);
      const validated = AiExplanationResponseSchema.parse(parsed);
      const outputText = validated.explanation;

      await AiCacheService.setCachedResponse(cacheKey, outputText);

      return outputText;
    } catch (err) {
      console.error('⚠️ Gemini generateExplanation failed, falling back:', err);
      return staticFallback;
    }
  }

  async generateStudyFeedback(
    masteries: Array<{ kcName: string; pMastery: number }>
  ): Promise<string> {
    const summaryStr = masteries.map((m) => `${m.kcName}:${Math.round(m.pMastery * 10)}`).join('|');
    const cacheKey = ['feedback', summaryStr];

    const cached = await AiCacheService.getCachedResponse(cacheKey);
    if (cached) return cached;

    const staticFallback =
      'Parabéns pelo empenho nos estudos! A prática constante é a chave para a maestria dos conceitos.';

    if (!this.genAI || !this.rateLimiter.tryAcquire()) return staticFallback;

    try {
      const prompt = `
Você é um orientador educacional. Responda sempre em português do Brasil (pt-BR), em tom profissional, claro e encorajador.

Dados de desempenho do aluno:
${masteries.map((m) => `- ${m.kcName}: ${Math.round(m.pMastery * 100)}% de domínio`).join('\n')}

Gere uma mensagem curta de incentivo pedagógico (2 frases) destacando os pontos fortes e encorajando a revisar os tópicos que precisam de atenção.

Responda no formato JSON:
{
  "message": "mensagem pedagógica em pt-BR"
}
      `;

      const text = await this.generateContentWithFallback(prompt);
      const parsed = safeParseGeminiJson<any>(text);
      const validated = AiFeedbackResponseSchema.parse(parsed);

      await AiCacheService.setCachedResponse(cacheKey, validated.message);
      return validated.message;
    } catch (err) {
      return staticFallback;
    }
  }

  async generateQuestionsFromContent(
    rawText: string,
    kcName: string,
    difficulty: string,
    count: number = 3
  ): Promise<DraftQuestion[]> {
    if (!this.genAI || !this.rateLimiter.tryAcquire()) {
      return [
        {
          statement: `Questão de exemplo sobre ${kcName}`,
          type: 'MULTIPLE_CHOICE',
          difficulty: difficulty || 'MEDIUM',
          options: [
            { id: 'opt1', text: 'Opção A' },
            { id: 'opt2', text: 'Opção B' },
            { id: 'opt3', text: 'Opção C' },
            { id: 'opt4', text: 'Opção D' },
          ],
          correctAnswer: 'opt1',
          explanation: 'Explicação pedagógica da questão.',
        },
        {
          statement: `Questão 2 de exemplo sobre ${kcName}`,
          type: 'MULTIPLE_CHOICE',
          difficulty: difficulty || 'MEDIUM',
          options: [
            { id: 'opt1', text: 'Opção 1' },
            { id: 'opt2', text: 'Opção 2' },
            { id: 'opt3', text: 'Opção 3' },
            { id: 'opt4', text: 'Opção 4' },
          ],
          correctAnswer: 'opt1',
          explanation: 'Explicação 2 pedagógica da questão.',
        },
      ];
    }

    try {
      const prompt = `
Você é um especialista em elaboração de avaliações educacionais para exames de alto nível.
Responda sempre em português do Brasil (pt-BR).

Texto de referência fornecido pelo professor:
<user_content>
${rawText}
</user_content>

DIRETRIZES DE DIFICULDADE (Dificuldade Solicitada: "${difficulty}"):
- Se "EASY" (Fácil): Questão de fixação direta de 1 passo.
- Se "MEDIUM" (Médio): Questão intermediária exigindo 2 etapas de raciocínio.
- Se "HARD" (Difícil): Questão DESAFIADORA de alto nível (estilo vestibulares de elite / olimpíadas), exigindo 3 a 4 etapas lógicas de resolução.

FORMATAÇÃO DE FÓRMULAS E UNIDADES (LaTeX):
- Se houver equações, unidades ou variáveis, use LaTeX entre cifrões simples em linha ($ ... $) de forma limpa.
- Para a letra grega Delta (variação), SEMPRE escreva \\\\Delta em LaTeX (ex: $\\\\Delta T_C = 25^\\\\circ\\text{C}$, $\\\\Delta T_F = 45^\\\\circ\\text{F}$, $\\\\Delta v$). NUNCA escreva apenas "Delta" como texto normal.
- Evite blocos de equações quebradas no meio de frases. Mantenha as equações na mesma linha usando cifrão simples $...$.
- Exemplo: "Com variação de $\\\\Delta T_C = 25^\\\\circ\\text{C}$, temos $\\\\Delta T_F = 1,8 \\\\cdot \\\\Delta T_C = 45^\\\\circ\\text{F}$."

Elabore ${count} questão(ões) de múltipla escolha com 4 opções cada sobre o componente de conhecimento "${kcName}".

Responda exclusivamente no formato JSON (sem nenhum texto explicativo adicional antes ou depois do objeto JSON):
{
  "questions": [
    {
      "statement": "Enunciado da questão em pt-BR",
      "type": "MULTIPLE_CHOICE",
      "difficulty": "${difficulty}",
      "options": [
        { "id": "opt1", "text": "$45^\\\\circ\\\\text{F}$" },
        { "id": "opt2", "text": "$36^\\\\circ\\\\text{F}$" },
        { "id": "opt3", "text": "$40^\\\\circ\\\\text{F}$" },
        { "id": "opt4", "text": "$20^\\\\circ\\\\text{F}$" }
      ],
      "correctAnswer": "opt1",
      "explanation": "Passo a passo completo de resolução em pt-BR: 1) Dados do problema: ... 2) Resolução: ... 3) Resultado final: ..."
    }
  ]
}
      `;

      const text = await this.generateContentWithFallback(prompt);
      const parsed = safeParseGeminiJson<any>(text);
      const validated = DraftQuestionListSchema.parse(parsed);

      return validated.questions;
    } catch (err: any) {
      console.error('⚠️ Gemini generateQuestionsFromContent failed:', err);
      throw new Error('Falha ao gerar questões via IA');
    }
  }

  async generateQuestionVariant(
    statement: string,
    options?: { id: string; text: string }[],
    correctAnswer?: string
  ): Promise<DraftQuestion> {
    const optionsText = options ? options.map((o) => `${o.id}: ${o.text}`).join('\n') : '';

    const prompt = `
Você é um professor especialista na criação de avaliações acadêmicas.
Sua tarefa é criar UMA VARIANTE (versão gêmea) da seguinte questão.
Mantenha o mesmo conceito e nível de dificuldade, mas altere os valores numéricos, o contexto do enunciado e as alternativas incorretas (distratores).

QUESTÃO ORIGINAL:
Enunciado: "${statement}"
${optionsText ? `Alternativas:\n${optionsText}\nResposta Correta: ${correctAnswer}` : ''}

DIRETRIZES DE FORMATAÇÃO:
- Responda em português do Brasil (pt-BR).
- Se houver fórmulas, use LaTeX entre cifrões simples ($ ... $).
- Forneça exatamente 4 alternativas (opt1 a opt4) se for múltipla escolha.

Responda exclusivamente no formato JSON:
{
  "statement": "Novo enunciado da questão variante em pt-BR",
  "type": "MULTIPLE_CHOICE",
  "difficulty": "MEDIUM",
  "options": [
    { "id": "opt1", "text": "Opção 1 em pt-BR" },
    { "id": "opt2", "text": "Opção 2 em pt-BR" },
    { "id": "opt3", "text": "Opção 3 em pt-BR" },
    { "id": "opt4", "text": "Opção 4 em pt-BR" }
  ],
  "correctAnswer": "opt1",
  "explanation": "Passo a passo detalhado de resolução da nova questão."
}
`;

    try {
      const text = await this.generateContentWithFallback(prompt);
      const parsed = safeParseGeminiJson<any>(text);
      return parsed;
    } catch (err: any) {
      console.error('⚠️ Gemini generateQuestionVariant failed:', err);
      throw new Error(`Falha ao gerar variante via IA: ${err.message || 'Erro no modelo'}`);
    }
  }

  async generateQuestionExplanation(
    statement: string,
    options?: { id: string; text: string }[],
    correctAnswer?: string
  ): Promise<string> {
    const optionsText = options ? options.map((o) => `${o.id}: ${o.text}`).join('\n') : '';

    const prompt = `
Você é um professor especialista. Elabore uma RESOLUÇÃO DETALHADA passo a passo em português do Brasil (pt-BR) para a seguinte questão:

Enunciado: "${statement}"
${optionsText ? `Alternativas:\n${optionsText}\nResposta Correta: ${correctAnswer}` : ''}

Use LaTeX entre cifrões simples ($ ... $) para equações se necessário.
Responda com um texto explicativo claro, estruturado e em português.
`;

    try {
      const text = await this.generateContentWithFallback(prompt);
      return text.trim();
    } catch (err: any) {
      console.error('⚠️ Gemini generateQuestionExplanation failed:', err);
      throw new Error(`Falha ao gerar resolução via IA: ${err.message || 'Erro no modelo'}`);
    }
  }
}
