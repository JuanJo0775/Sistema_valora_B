import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

// Parámetros de GET /v1/products (grill de la #52).
export class SearchProductsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'debe ser un número entero' })
  limit = 20;
}
