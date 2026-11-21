import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { isValidDisplayName, normalizeDisplayName } from '../../../domain/display-name';
import type { Role } from '../application/account-repository';
import { ROLE_NOTE_LENGTH } from '../application/change-role';
import { CURRENT_POLICY_VERSION } from '../application/policy';
import { normalizeEmail } from '../application/register-account';

// Grill de la #16, pregunta 7: el correo se valida ya normalizado.
const toNormalizedEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;

// #133: un solo mensaje para todo lo que no es un nombre (vacío, corto, largo, números, correo…).
const IsDisplayName = () =>
  ValidateBy({
    name: 'isDisplayName',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && isValidDisplayName(value),
      defaultMessage: () => 'debe tener de 2 a 40 letras, sin números, correos ni símbolos',
    },
  });

const toNormalizedName = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeDisplayName(value) : value;

// ADR-029: el token del enlace del correo (43 caracteres en base64url); se acota para no procesar basura.
export class VerifyEmailDto {
  @IsString({ message: 'debe ser texto' })
  @Length(1, 200, { message: 'debe tener entre 1 y 200 caracteres' })
  token!: string;
}

export class RegisterDto {
  @Transform(toNormalizedEmail)
  @MaxLength(254, { message: 'debe tener como máximo 254 caracteres' })
  @IsEmail({}, { message: 'debe ser un correo válido' })
  email!: string;

  // #133: el nombre visible; solo lo ve la propia cuenta (EC-08).
  @Transform(toNormalizedName)
  @IsDisplayName()
  displayName!: string;

  @IsString({ message: 'debe ser texto' })
  @Length(10, 128, { message: 'debe tener entre 10 y 128 caracteres' })
  password!: string;

  @IsIn([CURRENT_POLICY_VERSION], {
    message: `debe ser la versión vigente de la política (${CURRENT_POLICY_VERSION})`,
  })
  acceptedPolicyVersion!: string;
}

// Sin reglas de longitud mínima: una contraseña corta solo da «credenciales incorrectas».
export class LoginDto {
  @Transform(toNormalizedEmail)
  @MaxLength(254, { message: 'debe tener como máximo 254 caracteres' })
  @IsEmail({}, { message: 'debe ser un correo válido' })
  email!: string;

  @IsString({ message: 'debe ser texto' })
  @MaxLength(128, { message: 'debe tener como máximo 128 caracteres' })
  password!: string;
}

// ADR-032: la contraseña confirma que quien pide eliminar la cuenta es su dueño. ADR-033: las cuentas de
// Google no tienen contraseña y mandan `{}`; si la cuenta sí la tiene, el caso de uso exige que venga.
export class DeleteAccountDto {
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(128, { message: 'debe tener como máximo 128 caracteres' })
  password?: string;
}

// Grill de la #73, pregunta 1: comercio no se asigna hasta el Corte 3.
const ASSIGNABLE_ROLES: Role[] = ['reportante', 'moderador'];
const ROLE_NOTE_MESSAGE = `debe tener de ${String(ROLE_NOTE_LENGTH.min)} a ${String(ROLE_NOTE_LENGTH.max)} caracteres`;

// Cuerpo de POST /v1/moderation/roles (contrato de la #73).
export class ChangeRoleDto {
  @Transform(toNormalizedEmail)
  @MaxLength(254, { message: 'debe tener como máximo 254 caracteres' })
  @IsEmail({}, { message: 'debe ser un correo válido' })
  email!: string;

  @IsIn(ASSIGNABLE_ROLES, { message: 'debe ser reportante o moderador' })
  role!: Role;

  @IsString({ message: ROLE_NOTE_MESSAGE })
  @Length(ROLE_NOTE_LENGTH.min, ROLE_NOTE_LENGTH.max, { message: ROLE_NOTE_MESSAGE })
  note!: string;
}
