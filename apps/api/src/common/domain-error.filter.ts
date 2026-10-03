import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, type DomainErrorKind } from './domain-error';

const STATUS: Record<DomainErrorKind, number> = {
  not_found: HttpStatus.NOT_FOUND,
  forbidden: HttpStatus.FORBIDDEN,
  conflict: HttpStatus.CONFLICT,
  rule: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Translates domain errors into HTTP responses; everything else falls through to Nest. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const status = STATUS[error.kind];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, code: error.code, message: error.message });
  }
}
