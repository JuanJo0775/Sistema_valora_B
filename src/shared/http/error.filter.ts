import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { DomainError } from '../../domain/domain-error';
import { RequestValidationError } from './validation';

interface ErrorBody {
  code: string;
  message: string;
}

// Errores HTTP del framework: código estable y mensaje en español (descripciones de openapi.yaml).
const HTTP_ERRORS: Partial<Record<number, ErrorBody>> = {
  [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHORIZED', message: 'Se requiere sesión.' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'El rol no tiene permiso.' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: 'Conflicto con el estado actual.' },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Límite de frecuencia superado.',
  },
};

// Mensaje que NestJS pone por defecto en un ConflictException sin texto propio.
const DEFAULT_CONFLICT_MESSAGE = 'Conflict';

// NestJS convierte el fallo del lector de JSON en un BadRequestException con el mensaje del parser.
function isMalformedJson(exception: unknown): boolean {
  return (
    exception instanceof BadRequestException &&
    !(exception instanceof RequestValidationError) &&
    exception.message.includes('JSON')
  );
}

// Traduce todo error a la forma única { code, message } con el estado HTTP correcto.
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response: unknown = host.switchToHttp().getResponse();
    const { httpAdapter } = this.adapterHost;

    if (exception instanceof DomainError) {
      httpAdapter.reply(response, { code: exception.code, message: exception.message }, 422);
      return;
    }

    if (exception instanceof RequestValidationError) {
      const body = { code: 'VALIDATION_ERROR', message: exception.message };
      httpAdapter.reply(response, body, HttpStatus.BAD_REQUEST);
      return;
    }

    if (isMalformedJson(exception)) {
      const body = {
        code: 'VALIDATION_ERROR',
        message: 'El cuerpo de la solicitud no es JSON válido.',
      };
      httpAdapter.reply(response, body, HttpStatus.BAD_REQUEST);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const known = HTTP_ERRORS[status];
      if (known) {
        httpAdapter.reply(response, this.withOwnMessage(exception, status, known), status);
        return;
      }
      if (status < 500) {
        const body = { code: 'REQUEST_ERROR', message: 'La solicitud no se pudo procesar.' };
        httpAdapter.reply(response, body, status);
        return;
      }
    }

    // Grill de la #41, pregunta 5: el detalle solo va al log del servidor (nunca el cuerpo de la petición).
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    httpAdapter.reply(
      response,
      { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // Un 409 puede traer su propio mensaje (por ejemplo, un reporte repetido); los demás usan el fijo.
  private withOwnMessage(exception: HttpException, status: number, known: ErrorBody): ErrorBody {
    const hasOwnMessage =
      status === (HttpStatus.CONFLICT as number) && exception.message !== DEFAULT_CONFLICT_MESSAGE;
    return hasOwnMessage ? { code: known.code, message: exception.message } : known;
  }
}
