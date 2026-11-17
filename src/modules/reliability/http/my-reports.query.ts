import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_MY_REPORTS_LIMIT } from '../application/my-reports';

// Parámetros de GET /v1/me/reports (grill de la #76, pregunta 2).
export class MyReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe estar entre 1 y 50' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = DEFAULT_MY_REPORTS_LIMIT;

  // El nextBefore de la página anterior.
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'debe ser una fecha y hora ISO 8601' })
  before?: Date;
}
