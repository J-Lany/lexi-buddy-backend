import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VocabPreviewDto } from './vocab-preview.dto';
import { MAX_GENERATION_WORDS } from '../constants';

async function validateDto(body: Record<string, unknown>) {
  return validate(plainToInstance(VocabPreviewDto, body));
}

function words(count: number) {
  return Array.from({ length: count }, (_, i) => `word${i}`);
}

describe('VocabPreviewDto validation (same decorators the global ValidationPipe runs)', () => {
  describe('terms', () => {
    it(`accepts exactly ${MAX_GENERATION_WORDS} terms`, async () => {
      const errors = await validateDto({ terms: words(MAX_GENERATION_WORDS) });
      expect(errors).toHaveLength(0);
    });

    it(`rejects ${MAX_GENERATION_WORDS + 1} terms`, async () => {
      const errors = await validateDto({
        terms: words(MAX_GENERATION_WORDS + 1),
      });
      expect(errors.some((e) => e.property === 'terms')).toBe(true);
    });

    it('rejects an empty array', async () => {
      const errors = await validateDto({ terms: [] });
      expect(errors.some((e) => e.property === 'terms')).toBe(true);
    });
  });
});
