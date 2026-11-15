import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_QUEUE_LIMIT, type QueueReason } from '../application/moderation-queue';

const QUEUE_REASONS: QueueReason[] = ['desviacion', 'marcado'];

// Parámetros de GET /v1/moderation/queue (grill de la #32, pregunta 6).
export class QueueQueryDto {
  // discrepancia_oficial y verificacion_comercio llegan con el corte 3.
  @IsOptional()
  @IsIn(QUEUE_REASONS, { message: 'debe ser desviacion o marcado' })
  reason?: QueueReason;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe estar entre 1 y 50' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = DEFAULT_QUEUE_LIMIT;
}
