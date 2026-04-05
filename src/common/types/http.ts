import { Request } from 'express';

export type AuthUser = {
  id: number;
};

export type AppRequest = Request & {
  requestId?: string;
  user?: AuthUser;
};
