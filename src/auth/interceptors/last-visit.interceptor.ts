import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityService } from 'common/modules/activity/activity.service';

@Injectable()
export class LastVisitInterceptor implements NestInterceptor {
  constructor(private readonly activity: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<any>();

    const userIdRaw = req?.user?.sub;
    if (!userIdRaw) return next.handle();

    const url: string = req.originalUrl ?? req.url ?? '';
    if (url.startsWith('/health') || url.startsWith('/swagger')) {
      return next.handle();
    }

    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) return next.handle();

    return next.handle().pipe(
      tap(() => {
        void this.activity.touchUserLastVisit(userId).catch(() => {});
      }),
    );
  }
}
