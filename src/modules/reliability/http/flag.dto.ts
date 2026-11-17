import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { FlagReason } from '../application/stores';

const FLAG_REASONS: FlagReason[] = [
  'precio_falso',
  'producto_equivocado',
  'establecimiento_equivocado',
  'otro',
];

// Cuerpo de POST /v1/reports/{reportId}/flag (contrato de la #32).
export class FlagDto {
  @IsIn(FLAG_REASONS, {
    message: 'debe ser precio_falso, producto_equivocado, establecimiento_equivocado u otro',
  })
  reason!: FlagReason;

  @IsOptional()
  @IsString({ message: 'debe ser un texto' })
  @MaxLength(280, { message: 'debe tener como máximo 280 caracteres' })
  comment?: string;
}
