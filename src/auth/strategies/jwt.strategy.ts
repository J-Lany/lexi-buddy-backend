import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { JwtPayload } from 'auth/types/jwt-payload.type';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET must be set in environment variables');
    }

    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.['access_token'] as string | null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    };

    super(opts);
  }

  validate(payload: JwtPayload) {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token');
    return payload;
  }
}
