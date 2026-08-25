import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AssignmentPreviewDto,
  FrontAssignmentType,
} from './assignment-preview.dto';
import { MAX_GENERATION_WORDS } from '../constants';

async function validateDto(body: Record<string, unknown>) {
  return validate(plainToInstance(AssignmentPreviewDto, body));
}

function words(count: number) {
  return Array.from({ length: count }, (_, i) => `word${i}`);
}

describe('AssignmentPreviewDto validation (same decorators the global ValidationPipe runs)', () => {
  const validBody = {
    type: FrontAssignmentType.DEFINITION_QUIZ,
    questionsCount: MAX_GENERATION_WORDS,
    terms: words(MAX_GENERATION_WORDS),
  };

  it('accepts a fully valid payload', async () => {
    expect(await validateDto(validBody)).toHaveLength(0);
  });

  describe('terms', () => {
    it(`rejects ${MAX_GENERATION_WORDS + 1} terms`, async () => {
      const errors = await validateDto({
        ...validBody,
        terms: words(MAX_GENERATION_WORDS + 1),
      });
      expect(errors.some((e) => e.property === 'terms')).toBe(true);
    });

    it('rejects an empty array', async () => {
      const errors = await validateDto({ ...validBody, terms: [] });
      expect(errors.some((e) => e.property === 'terms')).toBe(true);
    });
  });

  describe('questionsCount', () => {
    it(`rejects ${MAX_GENERATION_WORDS + 1}`, async () => {
      const errors = await validateDto({
        ...validBody,
        questionsCount: MAX_GENERATION_WORDS + 1,
      });
      expect(errors.some((e) => e.property === 'questionsCount')).toBe(true);
    });

    it('accepts 1', async () => {
      const errors = await validateDto({ ...validBody, questionsCount: 1 });
      expect(errors.some((e) => e.property === 'questionsCount')).toBe(false);
    });
  });
});
