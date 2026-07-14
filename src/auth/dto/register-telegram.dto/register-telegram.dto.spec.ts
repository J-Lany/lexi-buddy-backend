import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterTelegramDto } from './register-telegram.dto';

function omitKey(obj: Record<string, unknown>, key: string) {
  const clone = { ...obj };
  delete clone[key];
  return clone;
}

async function validateDto(body: Record<string, unknown>) {
  return validate(plainToInstance(RegisterTelegramDto, body));
}

describe('RegisterTelegramDto validation (same decorators the global ValidationPipe runs)', () => {
  const validBody = {
    telegramId: 555,
    consentAccepted: true,
    consentVersion: 1,
  };

  it('accepts a fully valid payload', async () => {
    expect(await validateDto(validBody)).toHaveLength(0);
  });

  describe('telegramId', () => {
    it('rejects missing', async () => {
      const errors = await validateDto(omitKey(validBody, 'telegramId'));
      expect(errors.some((e) => e.property === 'telegramId')).toBe(true);
    });

    it('rejects 0', async () => {
      const errors = await validateDto({ ...validBody, telegramId: 0 });
      expect(errors.some((e) => e.property === 'telegramId')).toBe(true);
    });

    it('rejects a negative value', async () => {
      const errors = await validateDto({ ...validBody, telegramId: -5 });
      expect(errors.some((e) => e.property === 'telegramId')).toBe(true);
    });

    it('rejects a decimal', async () => {
      const errors = await validateDto({ ...validBody, telegramId: 5.5 });
      expect(errors.some((e) => e.property === 'telegramId')).toBe(true);
    });

    it('rejects a numeric string (no implicit conversion configured in the global ValidationPipe)', async () => {
      const errors = await validateDto({ ...validBody, telegramId: '555' });
      expect(errors.some((e) => e.property === 'telegramId')).toBe(true);
    });

    it('accepts a positive integer', async () => {
      const errors = await validateDto({ ...validBody, telegramId: 555 });
      expect(errors.some((e) => e.property === 'telegramId')).toBe(false);
    });
  });

  describe('consentAccepted', () => {
    it('rejects missing', async () => {
      const errors = await validateDto(omitKey(validBody, 'consentAccepted'));
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(true);
    });

    it('rejects false', async () => {
      const errors = await validateDto({
        ...validBody,
        consentAccepted: false,
      });
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(true);
    });

    it('rejects null', async () => {
      const errors = await validateDto({
        ...validBody,
        consentAccepted: null,
      });
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(true);
    });

    it('rejects the string "true"', async () => {
      const errors = await validateDto({
        ...validBody,
        consentAccepted: 'true',
      });
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(true);
    });

    it('rejects 1 (number, not boolean)', async () => {
      const errors = await validateDto({ ...validBody, consentAccepted: 1 });
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(true);
    });
  });

  // NOTE: consentVersion here only exercises @IsInt() (type/format). The
  // "must equal the current supported version" business rule is enforced
  // in AuthService.registerTelegram — see auth.service.spec.ts.
  describe('consentVersion', () => {
    it('rejects missing', async () => {
      const errors = await validateDto(omitKey(validBody, 'consentVersion'));
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });

    it('rejects a decimal', async () => {
      const errors = await validateDto({ ...validBody, consentVersion: 1.5 });
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });

    it('rejects a numeric string', async () => {
      const errors = await validateDto({ ...validBody, consentVersion: '1' });
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });
  });
});
