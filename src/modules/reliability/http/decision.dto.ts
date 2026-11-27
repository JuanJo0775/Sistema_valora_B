import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { NOTE_LENGTH } from '../application/decide-moderation';
import type { Decision } from '../application/stores';

const DECISIONS: Decision[] = ['aprobar', 'descartar', 'observar_cuentas'];
const NOTE_MESSAGE = `debe tener de ${String(NOTE_LENGTH.min)} a ${String(NOTE_LENGTH.max)} caracteres`;

// Cuerpo de POST /v1/moderation/{itemId}/decision (RN3 de RF-013: el motivo es obligatorio al descartar
// y al observar cuentas; aprobar no lo pide. El mínimo lo comprueba el caso de uso, que conoce la decisión).
export class DecisionDto {
  @IsIn(DECISIONS, { message: 'debe ser aprobar, descartar u observar_cuentas' })
  decision!: Decision;

  @IsOptional()
  @IsString({ message: NOTE_MESSAGE })
  @MaxLength(NOTE_LENGTH.max, { message: NOTE_MESSAGE })
  note?: string;
}
