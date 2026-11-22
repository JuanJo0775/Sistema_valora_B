import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { OpeningHours } from '../../../domain/opening-hours';

export class EstablishmentLocationDto {
  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat!: number;

  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng!: number;
}

// Cuerpo de PATCH /v1/commerce/establishment (#207). El horario lo revisa la regla de domain (422).
export class UpdateEstablishmentDto {
  @IsOptional()
  @IsObject({ message: 'debe tener los 7 días' })
  openingHours?: OpeningHours;

  @IsOptional()
  @Matches(/^(3\d{9}|60\d{8})$/, {
    message: 'debe ser un celular de 10 dígitos o un fijo que empiece por 60',
  })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'debe tener de 2 a 120 caracteres' })
  @Length(2, 120, { message: 'debe tener de 2 a 120 caracteres' })
  name?: string;

  @IsOptional()
  @IsObject({ message: 'debe tener lat y lng' })
  @ValidateNested()
  @Type(() => EstablishmentLocationDto)
  location?: EstablishmentLocationDto;
}
