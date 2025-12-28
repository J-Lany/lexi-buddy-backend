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
    return (
      typeof item === 'object' &&
      item !== null &&
      'question' in item &&
      'answers' in item &&
      Array.isArray((item as AiQuestion).answers) &&
      (item as AiQuestion).answers.every(
        (a) =>
          typeof (a as { text: string }).text === 'string' &&
          typeof (a as { isCorrect: boolean }).isCorrect === 'boolean',
      )
    );
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

    const result: AiQuestion[] = [];

    if (this.isAiQuestionArray(arr)) {
      arr.forEach((item) => {
        const questionType =
          item.questionType === 'multiple_choice' ||
          item.questionType === 'gap_fill' ||
          item.questionType === 'open_text'
            ? item.questionType
            : 'multiple_choice';

        const answersRaw = item.answers;
        const answers = (Array.isArray(answersRaw) ? answersRaw : []).map(
          (a) => ({
            text: a.text,
            isCorrect: Boolean(a.isCorrect),
          }),
        );

        if (!answers.length) return;

        if (!answers.some((a) => a.isCorrect)) {
          answers[0].isCorrect = true;
        }

        const explanation =
          typeof item.explanation === 'string'
            ? item.explanation.trim()
            : undefined;

        result.push({
          question: item.question,
          questionType,
          answers,
          explanation,
        });
      });
    }

    return result;
  }
}
