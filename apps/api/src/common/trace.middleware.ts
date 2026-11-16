import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request & { traceId?: string }, res: Response, next: NextFunction): void {
    const traceId = (req.headers['x-trace-id'] as string) ?? randomUUID();
    req.traceId = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}
