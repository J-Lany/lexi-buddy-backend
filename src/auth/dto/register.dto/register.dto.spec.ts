import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

function omitKey(obj: Record<string, unknown>, key: string) {
  const clone = { ...obj };
  delete clone[key];
  return clone;
}

async function validateDto(body: Record<string, unknown>) {
  return validate(plainToInstance(RegisterDto, body));
}

describe('RegisterDto validation (same decorators the global ValidationPipe runs)', () => {
  const validBody = {
    email: 'user@example.com',
    password: 'Password1!',
    consentAccepted: true,
    consentVersion: 1,
  };

  it('accepts a fully valid payload', async () => {
    expect(await validateDto(validBody)).toHaveLength(0);
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

    it('accepts true', async () => {
      const errors = await validateDto({
        ...validBody,
        consentAccepted: true,
      });
      expect(errors.some((e) => e.property === 'consentAccepted')).toBe(false);
    });
  });

  // NOTE: consentVersion here only exercises @IsInt() (type/format). The
  // "must equal the current supported version" business rule is enforced
  // in AuthService.register, not the DTO — see auth.service.spec.ts for the
  // 0 / negative / stale / future rejection matrix.
  describe('consentVersion', () => {
    it('rejects missing', async () => {
      const errors = await validateDto(omitKey(validBody, 'consentVersion'));
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });

    it('rejects a decimal', async () => {
      const errors = await validateDto({ ...validBody, consentVersion: 1.5 });
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });

    it('rejects a numeric string (no implicit conversion configured in the global ValidationPipe)', async () => {
      const errors = await validateDto({ ...validBody, consentVersion: '1' });
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(true);
    });

    it('accepts an integer', async () => {
      const errors = await validateDto({ ...validBody, consentVersion: 1 });
      expect(errors.some((e) => e.property === 'consentVersion')).toBe(false);
    });
  });
});
