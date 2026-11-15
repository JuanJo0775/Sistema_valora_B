import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';
import type { SortCriterion } from '../../../domain/neutral-ranking';

const SORT_CRITERIA: SortCriterion[] = ['unit_price', 'distance', 'recent'];

// Los de la URL llegan como texto: «true» y «false» se convierten a booleano; lo demás se rechaza.
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// Parámetros de GET /v1/products/{productId}/comparison (grill de la #15, preguntas 3 y 8).
export class ComparisonQueryDto {
  @Type(() => Number)
  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng!: number;

  // El mismo radio de /nearby: de 0,5 a 3 km (ADR-019), valores iniciales calibrables.
  @IsOptional()
  @Type(() => Number)
  @Min(0.5, { message: 'debe estar entre 0,5 y 3' })
  @Max(3, { message: 'debe estar entre 0,5 y 3' })
  radiusKm = 2;

  @IsOptional()
  @IsIn(SORT_CRITERIA, { message: 'debe ser unit_price, distance o recent' })
  sort: SortCriterion = 'unit_price';

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'debe ser true o false' })
  onlyCurrent = false;
}

// Parámetros de GET /v1/establishments/{establishmentId}/prices (grill de la #28, pregunta 2).
export class StorePricesQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'debe ser true o false' })
  onlyCurrent = false;
}
