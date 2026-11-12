import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional } from 'class-validator';

// Parámetros de GET /v1/establishments/nearby. Los de la URL llegan como texto y se convierten a número.
export class NearbyQueryDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'debe ser un número' })
  lat!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'debe ser un número' })
  lng!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'debe ser un número' })
  radiusKm = 2;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  limit = 20;
}
