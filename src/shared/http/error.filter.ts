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

interface ErrorResponse {
  status: number;
  body: ErrorBody;
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

const MALFORMED_JSON: ErrorBody = {
  code: 'VALIDATION_ERROR',
  message: 'El cuerpo de la solicitud no es JSON válido.',
};
const REQUEST_ERROR: ErrorBody = {
  code: 'REQUEST_ERROR',
  message: 'La solicitud no se pudo procesar.',
};
const INTERNAL_ERROR: ErrorBody = {
  code: 'INTERNAL_ERROR',
  message: 'Ocurrió un error inesperado.',
};

// Mensajes que NestJS pone por defecto cuando la excepción no trae texto propio.
const DEFAULT_MESSAGES = new Set(['Conflict', 'Forbidden', 'Forbidden resource']);

// Estados que pueden traer su propio código: 409 (IDEMPOTENCY_KEY_REUSED, #14) y 403
// (CSRF_TOKEN_INVALID, #16).
const OWN_CODE_STATUSES = new Set<number>([HttpStatus.CONFLICT, HttpStatus.FORBIDDEN]);

// NestJS convierte el fallo del lector de JSON en un BadRequestException con el mensaje del parser.
function isMalformedJson(exception: unknown): boolean {
  return (
    exception instanceof BadRequestException &&
    !(exception instanceof RequestValidationError) &&
    exception.message.includes('JSON')
  );
}

// Código propio de la excepción, si lo trae.
function ownCode(exception: HttpException): string | undefined {
  const body = exception.getResponse();
  if (typeof body !== 'object' || !('code' in body)) return undefined;
  return typeof body.code === 'string' ? body.code : undefined;
}

// Un 409 o un 403 pueden traer su propio código y su propio mensaje; los demás usan los fijos.
function withOwnMessage(exception: HttpException, status: number, known: ErrorBody): ErrorBody {
  if (!OWN_CODE_STATUSES.has(status)) return known;
  const code = ownCode(exception) ?? known.code;
  const hasOwnMessage = !DEFAULT_MESSAGES.has(exception.message);
  return { code, message: hasOwnMessage ? exception.message : known.message };
}

// Segundos de espera de un 429, si los trae (grill de la #16, pregunta 10).
function retryAfterOf(exception: unknown): number | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  if (exception.getStatus() !== (HttpStatus.TOO_MANY_REQUESTS as number)) return undefined;
  const body = exception.getResponse();
  if (typeof body !== 'object' || !('retryAfterSeconds' in body)) return undefined;
  return typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined;
}

// Decide el estado y el cuerpo de la respuesta; null significa «error inesperado».
function toErrorResponse(exception: unknown): ErrorResponse | null {
  if (exception instanceof DomainError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: { code: exception.code, message: exception.message },
    };
  }
  if (exception instanceof RequestValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { code: 'VALIDATION_ERROR', message: exception.message },
    };
  }
  if (isMalformedJson(exception)) {
    return { status: HttpStatus.BAD_REQUEST, body: MALFORMED_JSON };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const known = HTTP_ERRORS[status];
    if (known) return { status, body: withOwnMessage(exception, status, known) };
    if (status < 500) return { status, body: REQUEST_ERROR };
  }
  return null;
}

// Traduce todo error a la forma única { code, message } con el estado HTTP correcto.
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response: unknown = host.switchToHttp().getResponse();
    const known = toErrorResponse(exception);

    if (!known) {
      // Grill de la #41, pregunta 5: el detalle solo va al log del servidor (nunca el cuerpo).
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const { status, body } = known ?? {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: INTERNAL_ERROR,
    };
    const retryAfter = retryAfterOf(exception);
    if (retryAfter !== undefined) {
      this.adapterHost.httpAdapter.setHeader(response, 'Retry-After', String(retryAfter));
    }
    this.adapterHost.httpAdapter.reply(response, body, status);
  }
}
