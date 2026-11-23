import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { PromotionOffer } from '../../../domain/promotion';
import type { PromotionConditions } from '../application/promotions';

const TYPES: PromotionOffer['type'][] = [
  'descuento_porcentual',
  'precio_especial',
  'pague_x_lleve_y',
];
const PAYMENT_METHODS: PromotionConditions['paymentMethod'][] = [
  'cualquiera',
  'efectivo',
  'tarjeta',
];

// D6: condiciones fijas, sin texto libre.
export class PromotionConditionsDto {
  @IsOptional()
  @IsInt({ message: 'debe ser un número entero de 1 a 99' })
  @Min(1, { message: 'debe ser un número entero de 1 a 99' })
  @Max(99, { message: 'debe ser un número entero de 1 a 99' })
  maxPerCustomer?: number;

  @IsBoolean({ message: 'debe ser verdadero o falso' })
  whileStocksLast!: boolean;

  @IsIn(PAYMENT_METHODS, { message: 'debe ser cualquiera, efectivo o tarjeta' })
  paymentMethod!: PromotionConditions['paymentMethod'];
}

// Cuerpo de POST /v1/commerce/promotions (#206). Los límites de cada tipo los revisa la regla de D6.
export class CreatePromotionDto {
  @IsUUID('all', { message: 'debe ser un id válido' })
  presentationId!: string;

  @IsIn(TYPES, {
    message: 'debe ser descuento_porcentual, precio_especial o pague_x_lleve_y',
  })
  type!: PromotionOffer['type'];

  @ValidateIf((dto: CreatePromotionDto) => dto.type === 'descuento_porcentual')
  @IsInt({ message: 'es obligatorio en un descuento y debe ser un número entero' })
  percent?: number;

  @ValidateIf((dto: CreatePromotionDto) => dto.type === 'precio_especial')
  @IsInt({ message: 'es obligatorio en un precio especial y debe ser un número entero' })
  specialPriceCop?: number;

  @ValidateIf((dto: CreatePromotionDto) => dto.type === 'pague_x_lleve_y')
  @IsInt({ message: 'es obligatorio en pague X lleve Y y debe ser un número entero' })
  payX?: number;

  @ValidateIf((dto: CreatePromotionDto) => dto.type === 'pague_x_lleve_y')
  @IsInt({ message: 'es obligatorio en pague X lleve Y y debe ser un número entero' })
  takeY?: number;

  @IsObject({ message: 'debe tener whileStocksLast y paymentMethod' })
  @ValidateNested()
  @Type(() => PromotionConditionsDto)
  conditions!: PromotionConditionsDto;

  @IsDateString({ strict: true }, { message: 'debe ser una fecha AAAA-MM-DD' })
  validFrom!: string;

  @IsDateString({ strict: true }, { message: 'debe ser una fecha AAAA-MM-DD' })
  validUntil!: string;
}

// La oferta del tipo pedido; los campos de los otros tipos se ignoran.
export function offerOf(dto: CreatePromotionDto): PromotionOffer {
  switch (dto.type) {
    case 'descuento_porcentual':
      return { type: dto.type, percent: dto.percent ?? 0 };
    case 'precio_especial':
      return { type: dto.type, specialPriceCop: dto.specialPriceCop ?? 0 };
    case 'pague_x_lleve_y':
      return { type: dto.type, payX: dto.payX ?? 0, takeY: dto.takeY ?? 0 };
  }
}
