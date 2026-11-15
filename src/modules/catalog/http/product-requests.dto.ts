import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator';
import { isValidGtin } from '../../../domain/gtin';
import type { Unit } from '../../../domain/unit-price';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'und'];

// Cuerpo de POST /v1/product-requests (contrato de la #26).
export class ProductRequestDto {
  @IsString({ message: 'debe tener de 2 a 120 caracteres' })
  @Length(2, 120, { message: 'debe tener de 2 a 120 caracteres' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'debe tener como máximo 80 caracteres' })
  @MaxLength(80, { message: 'debe tener como máximo 80 caracteres' })
  brand?: string;

  @IsString({ message: 'debe ser el código de una categoría' })
  categoryCode!: string;

  @IsNumber({}, { message: 'debe ser un número mayor que 0' })
  @IsPositive({ message: 'debe ser un número mayor que 0' })
  quantity!: number;

  @IsIn(UNITS, { message: 'debe ser g, kg, ml, l o und' })
  unit!: Unit;

  @IsOptional()
  @IsInt({ message: 'debe ser un entero mayor o igual a 1' })
  @Min(1, { message: 'debe ser un entero mayor o igual a 1' })
  packCount?: number;

  // RF-003 RN2: EAN/UPC con su dígito de control.
  @IsOptional()
  @ValidateBy(
    {
      name: 'isGtin',
      validator: { validate: (value: unknown) => typeof value === 'string' && isValidGtin(value) },
    },
    { message: 'no es un código de barras válido' },
  )
  barcode?: string;
}
