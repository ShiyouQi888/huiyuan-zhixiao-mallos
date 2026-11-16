import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { randomUUID } from 'crypto';

/** 统一响应包装：{ code, message, data, traceId } */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ traceId?: string }>();
    const traceId = req.traceId ?? randomUUID();

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data: data === undefined ? null : data,
        traceId,
      })),
    );
  }
}
