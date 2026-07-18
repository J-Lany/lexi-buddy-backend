import type { CookieOptions } from 'express';

export function getAuthCookieOptions(): CookieOptions {
  const cookieDomain = process.env.COOKIE_DOMAIN;
  const cookieSecure = process.env.COOKIE_SECURE === 'true';

  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: cookieSecure,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}
