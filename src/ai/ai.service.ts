/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  getAssignmentPrompt,
  getTranslatePrompt,
  LangContext,
  TrainingTypeKey,
} from './prompts';

type AiVocabItem = {
  term: string;
  translation: string;
  synonyms?: string[];
};

type AiQuestion = {
  question: string;
  questionType: 'multiple_choice' | 'gap_fill' | 'open_text';
  answers: { text: string; isCorrect: boolean }[];
  explanation?: string;
};

type SafeJsonParseResult = AiVocabItem[] | AiQuestion[] | null;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.apiKey = this.config.get<string>('QWEN_API_KEY')!;
    this.baseUrl = this.config.get<string>('QWEN_BASE_URL')!;
    this.model = this.config.get<string>('QWEN_MODEL')!;
  }

  private async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): Promise<string> {
    try {
      const payload = {
        model: this.model,
        messages,
      };

      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl}/chat/completions`, payload, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 90000,
          maxBodyLength: 2 * 1024 * 1024,
          maxContentLength: 2 * 1024 * 1024,
        }),
      );

      const content =
        response.data?.choices?.[0]?.message?.content ??
        JSON.stringify(response.data);

      return typeof content === 'string' ? content : String(content);
    } catch (e) {
      const status = (e as any)?.response?.status;
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `AI request failed: ${message}${status ? ` (HTTP ${status})` : ''}`,
      );
      throw e;
    }
  }

  private isAiVocabItem(item: unknown): item is AiVocabItem {
    return (
      typeof item === 'object' &&
      item !== null &&
      'term' in item &&
      'translation' in item
    );
  }

  private isAiQuestion(item: unknown): item is AiQuestion {
    if (typeof item !== 'object' || item === null) return false;
    const it = item as any;

    if (typeof it.question !== 'string') return false;
    if (!Array.isArray(it.answers)) return false;

    const okAnswers = it.answers.every(
      (a: any) =>
        a && typeof a.text === 'string' && typeof a.isCorrect === 'boolean',
    );
    if (!okAnswers) return false;

    if (
      it.questionType !== undefined &&
      it.questionType !== 'multiple_choice' &&
      it.questionType !== 'gap_fill' &&
      it.questionType !== 'open_text'
    ) {
      return false;
    }

    return !(
      it.explanation !== undefined && typeof it.explanation !== 'string'
    );
  }

  private isAiVocabItemArray(arr: unknown[]): arr is AiVocabItem[] {
    return arr.every((item) => this.isAiVocabItem(item));
  }

  private isAiQuestionArray(arr: unknown[]): arr is AiQuestion[] {
    return arr.every((item) => this.isAiQuestion(item));
  }

  private extractJsonArray(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;

    if (s.startsWith('[') && s.endsWith(']')) return s;

    const first = s.indexOf('[');
    const last = s.lastIndexOf(']');
    if (first === -1 || last === -1 || last <= first) return null;

    const candidate = s.slice(first, last + 1).trim();
    if (!candidate.startsWith('[') || !candidate.endsWith(']')) return null;

    return candidate;
  }

  private safeParseJsonArray(raw: string): SafeJsonParseResult {
    const candidate = this.extractJsonArray(raw);
    if (!candidate) return null;

    let parsed: unknown;

    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      return null;
    }

    if (!Array.isArray(parsed)) return null;

    if (this.isAiVocabItemArray(parsed)) return parsed;
    if (this.isAiQuestionArray(parsed)) return parsed;

    return null;
  }

  private normalizeAnswers(
    raw: Array<{ text: unknown; isCorrect: unknown }>,
  ): { text: string; isCorrect: boolean }[] {
    const seen = new Set<string>();
    const cleaned: { text: string; isCorrect: boolean }[] = [];

    for (const a of raw) {
      const text = typeof a?.text === 'string' ? a.text.trim() : '';
      if (!text) continue;

      const dePrefixed = text
        .replace(/^\s*([A-Da-d]|\d+)[.)\-:]\s+/u, '')
        .replace(/^\s*-\s+/u, '')
        .trim();

      if (!dePrefixed) continue;

      const key = dePrefixed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      cleaned.push({
        text: dePrefixed,
        isCorrect: typeof a?.isCorrect === 'boolean' ? a.isCorrect : false,
      });
    }

    return cleaned;
  }

  private normalizeQuestionText(text: unknown): string {
    if (typeof text !== 'string') return '';
    return text.trim();
  }

  private normalizeExplanation(text: unknown): string | undefined {
    if (typeof text !== 'string') return undefined;
    const t = text.trim();
    return t ? t : undefined;
  }

  private ensureExactlyOneCorrect(
    answers: { text: string; isCorrect: boolean }[],
  ): { text: string; isCorrect: boolean }[] {
    if (!answers.length) return answers;

    const idxs = answers
      .map((a, i) => (a.isCorrect ? i : -1))
      .filter((i) => i !== -1);

    if (idxs.length === 0) {
      answers[0].isCorrect = true;
      return answers;
    }

    if (idxs.length > 1) {
      const keep = idxs[0];
      for (let i = 0; i < answers.length; i++) {
        answers[i].isCorrect = i === keep;
      }
    }

    return answers;
  }

  private enforceAnswerCount(
    answers: { text: string; isCorrect: boolean }[],
    count: number,
  ): { text: string; isCorrect: boolean }[] {
    if (answers.length < count) return [];
    if (answers.length === count) return this.ensureExactlyOneCorrect(answers);

    const correctIndex = answers.findIndex((a) => a.isCorrect);
    const picked: { text: string; isCorrect: boolean }[] = [];

    if (correctIndex >= 0) picked.push(answers[correctIndex]);

    for (let i = 0; i < answers.length && picked.length < count; i++) {
      if (i === correctIndex) continue;
      picked.push(answers[i]);
    }

    return this.ensureExactlyOneCorrect(picked);
  }

  private expectedShapeByTrainingType(trainingType: TrainingTypeKey): {
    questionType: AiQuestion['questionType'];
    answersCount: number;
  } {
    if (trainingType === 'gap_filling') {
      return { questionType: 'gap_fill', answersCount: 1 };
    }

    if (trainingType === 'collocation_check') {
      return { questionType: 'open_text', answersCount: 1 };
    }

    if (trainingType === 'phrase_fail') {
      return { questionType: 'multiple_choice', answersCount: 3 };
    }

    return { questionType: 'multiple_choice', answersCount: 3 };
  }

  private isQuestionTypeAllowedForTraining(
    trainingType: TrainingTypeKey,
    qType: unknown,
  ): qType is AiQuestion['questionType'] {
    if (
      qType !== 'multiple_choice' &&
      qType !== 'gap_fill' &&
      qType !== 'open_text'
    ) {
      return false;
    }

    const expected =
      this.expectedShapeByTrainingType(trainingType).questionType;
    return qType === expected;
  }

  private buildRepairPrompt(params: {
    trainingType: TrainingTypeKey;
    questionsCount: number;
    expectedQt: AiQuestion['questionType'];
    expectedAnswers: number;
  }) {
    const { trainingType, questionsCount, expectedQt, expectedAnswers } =
      params;

    return `
Your previous response did not match the required JSON format or constraints.

Fix it and return ONLY a JSON array with EXACTLY ${questionsCount} elements.

Hard rules:
- Return ONLY JSON array. No code fences. No extra text.
- Each element MUST be:
  {
    "question": "string",
    "questionType": "${expectedQt}",
    "answers": [
      { "text": "string", "isCorrect": true | false }
    ],
    "explanation": "string"
  }
- questionType MUST be exactly "${expectedQt}" for EVERY element.
- answers MUST contain EXACTLY ${expectedAnswers} items for EVERY element.
- There must be EXACTLY ONE answer with isCorrect: true in EVERY element.
- Do NOT prefix answers with "A)", "B)", "1.", "-" etc.
- Keep the language level appropriate and examples natural.

Exercise type: ${trainingType}.
`.trim();
  }

  async translateVocab(
    words: string[],
    meta?: {
      topic?: string;
      level?: string | null;
      ageGroup?: string | null;
      langContext?: LangContext;
    },
  ): Promise<AiVocabItem[]> {
    const prompt = getTranslatePrompt(words, meta);
    const raw = await this.chat([{ role: 'user', content: prompt }]);

    const arr = this.safeParseJsonArray(raw);
    if (!arr) {
      this.logger.error('Failed to parse vocab JSON from AI', raw);
      return words.map((w) => ({
        term: w,
        translation: w,
        synonyms: [],
      }));
    }

    const result: AiVocabItem[] = [];

    if (this.isAiVocabItemArray(arr)) {
      for (const item of arr) {
        const term = item.term.trim();
        const translation = item.translation.trim();

        if (!term || !translation) continue;

        let synonyms: string[] = [];
        if (Array.isArray(item.synonyms)) {
          synonyms = item.synonyms
            .filter((s: unknown): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 3);
        }

        result.push({ term, translation, synonyms });
      }
    }

    if (!result.length) {
      return words.map((w) => ({
        term: w,
        translation: w,
        synonyms: [],
      }));
    }

    return result;
  }

  async generateAssignment(params: {
    trainingType: TrainingTypeKey;
    terms: string[];
    questionsCount: number;
    topic?: string;
    level?: string | null;
    ageGroup?: string | null;
    langContext?: LangContext;
  }): Promise<AiQuestion[]> {
    const {
      trainingType,
      terms,
      questionsCount,
      topic,
      level,
      ageGroup,
      langContext,
    } = params;

    const prompt = getAssignmentPrompt({
      trainingType,
      terms,
      questionsCount,
      topic,
      level,
      ageGroup,
      langContext: langContext ?? {},
    });

    const { questionType: expectedQt, answersCount: expectedAnswers } =
      this.expectedShapeByTrainingType(trainingType);

    const attemptOnce = (raw: string): AiQuestion[] => {
      const parsed = this.safeParseJsonArray(raw);
      if (!parsed || !this.isAiQuestionArray(parsed)) return [];

      const result: AiQuestion[] = [];

      for (const item of parsed) {
        const question = this.normalizeQuestionText(item.question);
        if (!question) continue;

        if (
          !this.isQuestionTypeAllowedForTraining(
            trainingType,
            item.questionType,
          )
        ) {
          continue;
        }

        const answersRaw = Array.isArray(item.answers) ? item.answers : [];
        let answers = this.normalizeAnswers(
          answersRaw.map((a) => ({
            text: (a as any)?.text,
            isCorrect: (a as any)?.isCorrect,
          })),
        );

        answers = this.enforceAnswerCount(answers, expectedAnswers);
        if (!answers.length) continue;

        answers = this.ensureExactlyOneCorrect(answers);

        const explanation = this.normalizeExplanation(item.explanation);

        result.push({
          question,
          questionType: expectedQt,
          answers,
          ...(explanation ? { explanation } : {}),
        });

        if (result.length >= questionsCount) break;
      }

      return result;
    };

    const raw1 = await this.chat([{ role: 'user', content: prompt }]);
    const res1 = attemptOnce(raw1);

    if (res1.length === questionsCount) return res1;

    this.logger.warn(
      `AI generateAssignment incomplete on first try: expected=${questionsCount}, got=${res1.length}, type=${trainingType}`,
    );

    const repair = this.buildRepairPrompt({
      trainingType,
      questionsCount,
      expectedQt,
      expectedAnswers,
    });

    const raw2 = await this.chat([
      { role: 'user', content: prompt },
      { role: 'assistant', content: raw1 },
      { role: 'user', content: repair },
    ]);

    const res2 = attemptOnce(raw2);

    if (res2.length !== questionsCount) {
      this.logger.error(
        `AI generateAssignment failed after retry: expected=${questionsCount}, got=${res2.length}, type=${trainingType}`,
        raw2,
      );
    }

    return res2.length >= res1.length ? res2 : res1;
  }
}
