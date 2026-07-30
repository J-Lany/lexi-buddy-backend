import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first two characters of the local part and masks the rest', () => {
    expect(maskEmail('teacher@example.com')).toBe('te*****@example.com');
  });

  it('never returns the full local part unmasked', () => {
    const result = maskEmail('jo@example.com');
    expect(result).not.toBe('jo@example.com');
    expect(result).toContain('*');
  });
});
