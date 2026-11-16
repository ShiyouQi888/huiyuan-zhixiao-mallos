import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { BusinessException } from './business.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { traceId?: string }>();
    const res = ctx.getResponse<Response>();
    const traceId = req.traceId ?? (req.headers['x-trace-id'] as string) ?? randomUUID();

    let code = 5000;
    let message = '系统繁忙，请稍后再试';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof BusinessException) {
      code = exception.code;
      message = exception.message;
      status = exception.getStatus();
    } else if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      code = exception.getStatus() === HttpStatus.BAD_REQUEST ? 1001 : exception.getStatus();
      message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: string | string[] }).message as string) ?? exception.message;
      if (Array.isArray(message)) message = message.join('; ');
      status = exception.getStatus();
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      code = 3002;
      message = exception.code === 'P2002' ? '数据已存在，请勿重复提交' : '数据操作失败';
      status = HttpStatus.BAD_REQUEST;
    } else {
      this.logger.error(`[${traceId}] ${req.method} ${req.url}`, exception as Error);
    }

    res.status(status).json({ code, message, data: null, traceId });
  }
}
