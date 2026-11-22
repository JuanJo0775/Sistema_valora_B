import { Type } from 'class-transformer';
import {
  Equals,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MERCHANT_TERMS_VERSION } from '../application/claim-establishment';

// Ubicación del celular en el momento: solo para comprobar la presencia, nunca se guarda (EC-08).
export class ClaimLocationDto {
  @IsLatitude({ message: 'debe estar entre -90 y 90' })
  lat!: number;

  @IsLongitude({ message: 'debe estar entre -180 y 180' })
  lng!: number;
}

export class ClaimEstablishmentDto {
  @IsUUID('all', { message: 'debe ser un id válido' })
  establishmentId!: string;

  @IsString({ message: 'debe tener de 2 a 80 caracteres' })
  @Length(2, 80, { message: 'debe tener de 2 a 80 caracteres' })
  responsibleName!: string;

  // El dígito de verificación lo revisa el caso de uso (isValidNit).
  @IsOptional()
  @IsString({ message: 'debe ser un NIT' })
  @MaxLength(20, { message: 'debe ser un NIT' })
  nit?: string;

  @Matches(/^(3\d{9}|60\d{8})$/, {
    message: 'debe ser un celular de 10 dígitos o un fijo que empiece por 60',
  })
  phone!: string;

  @Equals(MERCHANT_TERMS_VERSION, { message: 'debe ser la versión vigente de las condiciones' })
  acceptedTermsVersion!: string;

  @IsObject({ message: 'debe tener lat y lng' })
  @ValidateNested()
  @Type(() => ClaimLocationDto)
  location!: ClaimLocationDto;
}
