import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { type Municipality, MUNICIPALITY_CODES } from '../../../domain/municipality';
import type { SortCriterion } from '../../../domain/neutral-ranking';

const SORT_CRITERIA: SortCriterion[] = ['unit_price', 'distance', 'recent'];

// Los de la URL llegan como texto: «true» y «false» se convierten a booleano; lo demás se rechaza.
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// Sin municipio, la ubicación es obligatoria; con municipio, solo si se manda una de las dos.
const needsLocation = (dto: ComparisonQueryDto): boolean =>
  dto.municipality === undefined || dto.lat !== undefined || dto.lng !== undefined;

// Parámetros de GET /v1/products/{productId}/comparison (grill de la #15, preguntas 3 y 8).
export class ComparisonQueryDto {
  // Grill de la #106: con municipio, la ubicación es opcional; si se manda, van las dos.
  @ValidateIf(needsLocation)
  @Type(() => Number)
  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat?: number;

  @ValidateIf(needsLocation)
  @Type(() => Number)
  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng?: number;

  // Grill de la #106 (RF-009 RN5): uno de los 12 municipios del Quindío.
  @IsOptional()
  @IsIn(MUNICIPALITY_CODES, { message: 'debe ser un municipio del Quindío' })
  municipality?: Municipality;

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

// Parámetros de GET /v1/featured-products (B#120).
export class FeaturedProductsQueryDto {
  // Uno de los 12 municipios del Quindío; obligatorio.
  @IsIn(MUNICIPALITY_CODES, { message: 'debe ser un municipio del Quindío' })
  municipality!: Municipality;

  // Mismos valores que el parámetro común Limit del contrato, con 5 por defecto.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = 5;
}
