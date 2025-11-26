import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from 'auth/types/jwt-payload.type';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
