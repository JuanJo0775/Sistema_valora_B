import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// Rechazo de la validación de entrada: el filtro lo responde como 400 VALIDATION_ERROR.
export class RequestValidationError extends BadRequestException {}

// Une todos los errores en un solo mensaje: «campo: mensaje; campo: mensaje».
function toMessage(errors: ValidationError[]): string {
  return errors
    .map((error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
    .join('; ');
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: (errors) => new RequestValidationError(toMessage(errors)),
  });
}
