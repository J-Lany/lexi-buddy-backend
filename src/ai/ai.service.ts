/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  getAssignmentPrompt,
  getTranslatePrompt,
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

  private async chat(prompt: string): Promise<string> {
    const payload = {
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    };

    const response = await firstValueFrom(
      this.http.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      }),
    );

    const content =
      response.data?.choices?.[0]?.message?.content ??
      JSON.stringify(response.data);

    return content;
  }

  private isAiVocabItem(item: unknown): item is AiVocabItem {
    return (
      typeof item === 'object' &&
      item !== null &&
      'term' in item &&
      'translation' in item &&
      typeof (item as AiVocabItem).term === 'string' &&
      typeof (item as AiVocabItem).translation === 'string'
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

    return true;
  }

  private isAiVocabItemArray(arr: unknown[]): arr is AiVocabItem[] {
    return arr.every((item) => this.isAiVocabItem(item));
  }

  private isAiQuestionArray(arr: unknown[]): arr is AiQuestion[] {
    return arr.every((item) => this.isAiQuestion(item));
  }

  private safeParseJsonArray(raw: string): SafeJsonParseResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }

    if (!Array.isArray(parsed)) {
      return null;
    }

    if (this.isAiVocabItemArray(parsed)) {
      return parsed;
    }

    if (this.isAiQuestionArray(parsed)) {
      return parsed;
    }

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
    if (answers.length === count) return answers;

    const correctIndex = answers.findIndex((a) => a.isCorrect);
    const picked: { text: string; isCorrect: boolean }[] = [];

    if (correctIndex >= 0) picked.push(answers[correctIndex]);

    for (let i = 0; i < answers.length && picked.length < count; i++) {
      if (i === correctIndex) continue;
      picked.push(answers[i]);
    }

    return this.ensureExactlyOneCorrect(picked);
  }

  private normalizeQuestionText(text: unknown): string {
    if (typeof text !== 'string') return '';
    return text.trim();
  }

  async translateVocab(
    words: string[],
    meta?: { topic?: string; level?: string | null; ageGroup?: string | null },
  ): Promise<AiVocabItem[]> {
    const prompt = getTranslatePrompt(words, meta);
    const raw = await this.chat(prompt);

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
      arr.forEach((item) => {
        const term = item.term ?? '';
        const translation = item.translation ?? '';
        let synonyms: string[] = [];

        if (Array.isArray(item.synonyms)) {
          synonyms = item.synonyms.filter((s: string) => typeof s === 'string');
        }

        if (!term || !translation) return;

        result.push({ term, translation, synonyms });
      });
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
  }): Promise<AiQuestion[]> {
    const { trainingType, terms, questionsCount, topic, level, ageGroup } =
      params;

    const prompt = getAssignmentPrompt({
      trainingType,
      terms,
      questionsCount,
      topic,
      level,
      ageGroup,
    });

    const raw = await this.chat(prompt);

    const arr = this.safeParseJsonArray(raw);
    if (!arr) {
      this.logger.error('Failed to parse assignment JSON from AI', raw);
      return [];
    }

    if (!this.isAiQuestionArray(arr)) {
      this.logger.error('AI returned JSON but not questions array', raw);
      return [];
    }

    const result: AiQuestion[] = [];

    arr.forEach((item) => {
      const question = this.normalizeQuestionText(item.question);
      if (!question) return;

      const questionType =
        item.questionType === 'multiple_choice' ||
        item.questionType === 'gap_fill' ||
        item.questionType === 'open_text'
          ? item.questionType
          : 'multiple_choice';

      const answersRaw = Array.isArray(item.answers) ? item.answers : [];
      let answers = this.normalizeAnswers(
        answersRaw.map((a) => ({
          text: (a as any)?.text,
          isCorrect: (a as any)?.isCorrect,
        })),
      );

      if (trainingType === 'phrase_fail') {
        answers = this.enforceAnswerCount(answers, 3);
      } else if (questionType === 'multiple_choice') {
        if (answers.length < 3) return;
      } else {
        if (answers.length < 1) return;
      }

      if (!answers.length) return;

      answers = this.ensureExactlyOneCorrect(answers);

      const explanation =
        typeof item.explanation === 'string'
          ? item.explanation.trim()
          : undefined;

      result.push({
        question,
        questionType,
        answers,
        explanation,
      });
    });

    return result;
  }
}
