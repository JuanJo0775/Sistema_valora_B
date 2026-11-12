import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

// Parámetros de GET /v1/products (grill de la #52). Que llegue exactamente uno de q o barcode
// lo revisa el controlador.
export class SearchProductsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'debe tener al menos 2 caracteres' })
  q?: string;

  @IsOptional()
  @Matches(/^[0-9]{8,14}$/, { message: 'debe tener de 8 a 14 dígitos' })
  barcode?: string;

  // Mismos valores que el parámetro común Limit del contrato.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  @Min(1, { message: 'debe estar entre 1 y 50' })
  @Max(50, { message: 'debe estar entre 1 y 50' })
  limit = 20;
}
