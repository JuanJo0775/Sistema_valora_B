import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { isValidGtin } from '../../../domain/gtin';
import type { Unit } from '../../../domain/unit-price';
import { REQUEST_NOTE_LENGTH } from '../application/decide-product-request';
import type { ProductRequestDecision } from '../application/product-requests';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'und'];
const DECISIONS: ProductRequestDecision[] = ['aprobar', 'fusionar', 'rechazar'];
const NOTE_MESSAGE = `debe tener de ${String(REQUEST_NOTE_LENGTH.min)} a ${String(REQUEST_NOTE_LENGTH.max)} caracteres`;

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

// Cuerpo de POST /v1/moderation/product-requests/{requestId}/decision.
export class ProductRequestDecisionDto {
  @IsIn(DECISIONS, { message: 'debe ser aprobar, fusionar o rechazar' })
  decision!: ProductRequestDecision;

  @IsString({ message: NOTE_MESSAGE })
  @Length(REQUEST_NOTE_LENGTH.min, REQUEST_NOTE_LENGTH.max, { message: NOTE_MESSAGE })
  note!: string;

  // Solo y siempre con fusionar.
  @ValidateIf((dto: ProductRequestDecisionDto) => dto.decision === 'fusionar')
  @IsUUID('all', { message: 'debe ser un UUID; es obligatorio al fusionar' })
  mergeInto?: string;
}
