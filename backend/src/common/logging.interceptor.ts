import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

/** Logs every HTTP request: method, path, status, duration. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`,
          );
        },
        error: (error: Error & { status?: number }) => {
          this.logger.warn(
            `${req.method} ${req.originalUrl} ${error.status ?? 500} ${Date.now() - started}ms — ${error.message}`,
          );
        },
      }),
    );
  }
}
