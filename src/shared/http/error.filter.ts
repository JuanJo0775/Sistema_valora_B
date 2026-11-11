import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { DomainError } from '../../domain/domain-error';

// Traduce todo error a la forma única { code, message } con el estado HTTP correcto.
@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response: unknown = host.switchToHttp().getResponse();
    const { httpAdapter } = this.adapterHost;

    if (exception instanceof DomainError) {
      httpAdapter.reply(response, { code: exception.code, message: exception.message }, 422);
    }
  }
}
