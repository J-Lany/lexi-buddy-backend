import { AiService } from './ai.service';

// Separate interface — not intersecting with AiService to avoid `never`
// (TS collapses A & { private foo } to never when foo is already private in A)
interface AiServiceTestable {
  safeParseJsonArray(raw: string): unknown;
  ensureExactlyOneCorrect(
    answers: { text: string; isCorrect: boolean }[],
  ): { text: string; isCorrect: boolean }[];
  enforceAnswerCount(
    answers: { text: string; isCorrect: boolean }[],
    count: number,
  ): { text: string; isCorrect: boolean }[];
  normalizeAnswers(
    raw: Array<{ text: unknown; isCorrect: unknown }>,
  ): { text: string; isCorrect: boolean }[];
}

describe('AiService (unit, private logic)', () => {
  let service: AiServiceTestable;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          QWEN_API_KEY: 'test-key',
          QWEN_BASE_URL: 'https://api.test.com',
          QWEN_MODEL: 'test-model',
        };
        return map[key];
      }),
    };
    const mockHttp = { post: jest.fn() };

    service = new AiService(
      mockConfig as any,
      mockHttp as any,
    ) as unknown as AiServiceTestable;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // safeParseJsonArray
  // ─────────────────────────────────────────────────────────────────────────

  describe('safeParseJsonArray', () => {
    it('returns null on empty string', () => {
      expect(service.safeParseJsonArray('')).toBeNull();
    });

    it('returns null on non-JSON text', () => {
      expect(
        service.safeParseJsonArray('sorry, here is your answer:'),
      ).toBeNull();
    });

    it('returns null when top-level is an object, not array', () => {
      expect(service.safeParseJsonArray('{"key": "value"}')).toBeNull();
    });

    it('parses a bare JSON array of vocab items', () => {
      const raw = '[{"term":"cat","translation":"кот","synonyms":["kitty"]}]';
      const result = service.safeParseJsonArray(raw);
      expect(result).toEqual([
        { term: 'cat', translation: 'кот', synonyms: ['kitty'] },
      ]);
    });

    it('extracts JSON array from markdown code fence', () => {
      const raw = '```json\n[{"term":"dog","translation":"собака"}]\n```';
      const result = service.safeParseJsonArray(raw);
      expect(result).toEqual([{ term: 'dog', translation: 'собака' }]);
    });

    it('extracts JSON array embedded in prose text', () => {
      const raw =
        'Here are the results:\n[{"term":"fish","translation":"рыба"}]\nEnjoy!';
      const result = service.safeParseJsonArray(raw);
      expect(result).toEqual([{ term: 'fish', translation: 'рыба' }]);
    });

    it('returns null when JSON is malformed', () => {
      expect(service.safeParseJsonArray('[{"term": "cat"')).toBeNull();
    });

    it('returns null when array contains items matching neither vocab nor question shape', () => {
      expect(service.safeParseJsonArray('[{"foo":"bar"}]')).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ensureExactlyOneCorrect
  // ─────────────────────────────────────────────────────────────────────────

  describe('ensureExactlyOneCorrect', () => {
    it('returns empty array unchanged', () => {
      expect(service.ensureExactlyOneCorrect([])).toEqual([]);
    });

    it('marks first answer correct when none are correct', () => {
      const answers = [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: false },
      ];
      const result = service.ensureExactlyOneCorrect(answers);
      expect(result[0].isCorrect).toBe(true);
      expect(result[1].isCorrect).toBe(false);
    });

    it('keeps single correct answer unchanged', () => {
      const answers = [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: true },
      ];
      const result = service.ensureExactlyOneCorrect(answers);
      expect(result.filter((a) => a.isCorrect)).toHaveLength(1);
      expect(result[1].isCorrect).toBe(true);
    });

    it('reduces multiple correct answers to exactly one (the first)', () => {
      const answers = [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: true },
        { text: 'C', isCorrect: false },
      ];
      const result = service.ensureExactlyOneCorrect(answers);
      expect(result.filter((a) => a.isCorrect)).toHaveLength(1);
      expect(result[0].isCorrect).toBe(true);
      expect(result[1].isCorrect).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // enforceAnswerCount
  // ─────────────────────────────────────────────────────────────────────────

  describe('enforceAnswerCount', () => {
    it('returns empty array when fewer answers than required', () => {
      const answers = [{ text: 'A', isCorrect: true }];
      expect(service.enforceAnswerCount(answers, 3)).toEqual([]);
    });

    it('returns answers unchanged when count matches exactly', () => {
      const answers = [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
        { text: 'C', isCorrect: false },
      ];
      const result = service.enforceAnswerCount(answers, 3);
      expect(result).toHaveLength(3);
    });

    it('trims to requested count preserving the correct answer', () => {
      const answers = [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: true }, // correct one
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false },
      ];
      const result = service.enforceAnswerCount(answers, 3);
      expect(result).toHaveLength(3);
      expect(result.some((a) => a.isCorrect && a.text === 'B')).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // normalizeAnswers
  // ─────────────────────────────────────────────────────────────────────────

  describe('normalizeAnswers', () => {
    it('strips A) B) C) prefixes from answers', () => {
      const raw = [
        { text: 'A) correct answer', isCorrect: true },
        { text: 'B) wrong', isCorrect: false },
      ];
      const result = service.normalizeAnswers(raw);
      expect(result[0].text).toBe('correct answer');
      expect(result[1].text).toBe('wrong');
    });

    it('strips numeric 1. 2. prefixes', () => {
      const raw = [
        { text: '1. first', isCorrect: true },
        { text: '2. second', isCorrect: false },
      ];
      const result = service.normalizeAnswers(raw);
      expect(result[0].text).toBe('first');
      expect(result[1].text).toBe('second');
    });

    it('deduplicates case-insensitive answers', () => {
      const raw = [
        { text: 'Cat', isCorrect: true },
        { text: 'cat', isCorrect: false }, // duplicate
        { text: 'Dog', isCorrect: false },
      ];
      const result = service.normalizeAnswers(raw);
      expect(result).toHaveLength(2);
    });

    it('skips answers with empty text', () => {
      const raw = [
        { text: '', isCorrect: false },
        { text: 'valid', isCorrect: true },
      ];
      const result = service.normalizeAnswers(raw);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('valid');
    });

    it('defaults isCorrect to false for non-boolean values', () => {
      const raw = [{ text: 'answer', isCorrect: 'yes' as any }];
      const result = service.normalizeAnswers(raw);
      expect(result[0].isCorrect).toBe(false);
    });
  });
});
