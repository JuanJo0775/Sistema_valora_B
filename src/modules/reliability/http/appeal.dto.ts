import { IsString, Length } from 'class-validator';
import { NOTE_LENGTH } from '../application/decide-moderation';

const NOTE_MESSAGE = `debe tener de ${String(NOTE_LENGTH.min)} a ${String(NOTE_LENGTH.max)} caracteres`;

// Cuerpo de POST /v1/reports/{reportId}/appeal (contrato de la #71).
export class AppealDto {
  @IsString({ message: NOTE_MESSAGE })
  @Length(NOTE_LENGTH.min, NOTE_LENGTH.max, { message: NOTE_MESSAGE })
  note!: string;
}
