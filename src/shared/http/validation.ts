import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

// Rechazo de la validación de entrada: el filtro lo responde como 400 VALIDATION_ERROR.
export class RequestValidationError extends BadRequestException {}

// Restricción que class-validator usa cuando llega un campo que el DTO no declara.
const NOT_ALLOWED_CONSTRAINT = 'whitelistValidation';

function messagesOf(error: ValidationError): string {
  return Object.entries(error.constraints ?? {})
    .map(([constraint, message]) =>
      constraint === NOT_ALLOWED_CONSTRAINT ? 'no está permitido' : message,
    )
    .join(', ');
}

// Une todos los errores en un solo mensaje: «campo: mensaje; campo: mensaje».
function toMessage(errors: ValidationError[]): string {
  return errors.map((error) => `${error.property}: ${messagesOf(error)}`).join('; ');
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    // Grill de la #41, pregunta 4: rechazar los campos no declarados y convertir el cuerpo al DTO.
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new RequestValidationError(toMessage(errors)),
  });
}
