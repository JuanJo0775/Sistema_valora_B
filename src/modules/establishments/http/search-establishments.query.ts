import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { type Municipality, MUNICIPALITY_CODES } from '../../../domain/municipality';

// Parámetros de GET /v1/establishments (#116).
export class SearchEstablishmentsQueryDto {
  // Se quitan los espacios de los extremos: «   » no es una búsqueda.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'debe tener al menos 2 caracteres' })
  q?: string;

  // Uno de los 12 municipios del Quindío (#106).
  @IsOptional()
  @IsIn(MUNICIPALITY_CODES, { message: 'debe ser un municipio del Quindío' })
  municipality?: Municipality;

  // Mismos valores que el parámetro común Limit del contrato.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = 20;
}
