import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { PriceType } from '../application/report-repository';

const PRICE_TYPES: PriceType[] = ['normal', 'oferta'];

// Cuerpo de POST /v1/reports (esquema ReportCreate del contrato; grill de la #14, pregunta 4).
export class ReportCreateDto {
  @IsUUID('all', { message: 'debe ser un UUID' })
  presentationId!: string;

  @IsUUID('all', { message: 'debe ser un UUID' })
  establishmentId!: string;

  @IsInt({ message: 'debe ser un número entero' })
  @Min(1, { message: 'debe estar entre 1 y 10000000' })
  @Max(10_000_000, { message: 'debe estar entre 1 y 10000000' })
  priceCop!: number;

  @IsOptional()
  @IsIn(PRICE_TYPES, { message: 'debe ser normal u oferta' })
  priceType: PriceType = 'normal';

  @IsISO8601({ strict: true }, { message: 'debe ser una fecha y hora ISO 8601' })
  observedAt!: string;
}
