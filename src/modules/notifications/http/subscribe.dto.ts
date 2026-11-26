import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// Las dos claves que entrega el navegador al suscribirse (PushSubscription.toJSON().keys).
export class PushKeysDto {
  @IsString({ message: 'debe ser una cadena en base64url' })
  @Length(20, 200, { message: 'debe tener de 20 a 200 caracteres' })
  @Matches(BASE64URL, { message: 'debe ser una cadena en base64url' })
  p256dh!: string;

  @IsString({ message: 'debe ser una cadena en base64url' })
  @Length(10, 100, { message: 'debe tener de 10 a 100 caracteres' })
  @Matches(BASE64URL, { message: 'debe ser una cadena en base64url' })
  auth!: string;
}

// Cuerpo de POST /v1/notifications/subscriptions: lo que devuelve PushSubscription.toJSON().
export class SubscribeDto {
  @IsString({ message: 'debe ser una dirección https' })
  @MaxLength(2048, { message: 'debe tener como máximo 2048 caracteres' })
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'debe ser una dirección https' },
  )
  endpoint!: string;

  // Sin IsDefined, un cuerpo sin keys pasaba la validación y el controlador fallaba con 500.
  @IsDefined({ message: 'son obligatorias: p256dh y auth' })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
