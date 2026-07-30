/** Masks the local part of an email for logs, e.g. "jo**@example.com". Never log a full email. */
export function maskEmail(email: string): string {
  const [localPart = '', domainPart = ''] = email.split('@');

  const visiblePart = localPart.slice(0, 2);
  const hiddenLength = Math.max(localPart.length - visiblePart.length, 1);

  return `${visiblePart}${'*'.repeat(hiddenLength)}@${domainPart}`;
}
