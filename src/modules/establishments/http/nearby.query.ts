import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

// Parámetros de GET /v1/establishments/nearby (grill de la #50, preguntas 3 y 4).
// Los de la URL llegan como texto y se convierten a número.
export class NearbyQueryDto {
  @Type(() => Number)
  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng!: number;

  // De 0,5 a 3 km (ADR-019); valores iniciales calibrables.
  @IsOptional()
  @Type(() => Number)
  @Min(0.5, { message: 'debe estar entre 0,5 y 3' })
  @Max(3, { message: 'debe estar entre 0,5 y 3' })
  radiusKm = 2;

  // Mismos valores que el parámetro común Limit del contrato.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = 20;
}
