import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { isValidDisplayName, normalizeDisplayName } from '../../../domain/display-name';
import type { Role } from '../application/account-repository';
import { ROLE_NOTE_LENGTH } from '../application/change-role';
import { PASSWORD_LENGTH } from '../application/password-policy';
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

// Las mismas reglas de contraseña al registrarse, al restablecerla y al cambiarla (ADR-033).
const PASSWORD_MESSAGE = `debe tener entre ${String(PASSWORD_LENGTH.min)} y ${String(PASSWORD_LENGTH.max)} caracteres`;

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
  @Length(PASSWORD_LENGTH.min, PASSWORD_LENGTH.max, { message: PASSWORD_MESSAGE })
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

// RF-001 (#181): quien entró con Google acepta la política y elige su nombre en /bienvenida. El correo
// no viaja en el cuerpo: sale de la cookie firmada del registro pendiente.
export class CompleteGoogleSignUpDto {
  @Transform(toNormalizedName)
  @IsDisplayName()
  displayName!: string;

  @IsIn([CURRENT_POLICY_VERSION], {
    message: `debe ser la versión vigente de la política (${CURRENT_POLICY_VERSION})`,
  })
  acceptedPolicyVersion!: string;
}

// ADR-032: la contraseña confirma que quien pide eliminar la cuenta es su dueño. Una cuenta creada con
// Google no tiene contraseña y confirma con su correo (#179). Exactamente uno de los dos.
export class DeleteAccountDto {
  @ValidateIf((dto: DeleteAccountDto) => dto.confirmEmail === undefined)
  @IsString({ message: 'debe ser texto' })
  @MaxLength(128, { message: 'debe tener como máximo 128 caracteres' })
  password?: string;

  @ValidateIf((dto: DeleteAccountDto) => dto.confirmEmail !== undefined)
  @IsString({ message: 'debe ser texto' })
  @MaxLength(254, { message: 'debe tener como máximo 254 caracteres' })
  @ValidateBy({
    name: 'passwordOrEmail',
    validator: {
      validate: (_value, args) => (args?.object as DeleteAccountDto).password === undefined,
      defaultMessage: () => 'envía la contraseña o el correo, no los dos',
    },
  })
  confirmEmail?: string;
}

// ADR-033: «olvidé mi contraseña». Solo el correo, ya normalizado.
export class ForgotPasswordDto {
  @Transform(toNormalizedEmail)
  @MaxLength(254, { message: 'debe tener como máximo 254 caracteres' })
  @IsEmail({}, { message: 'debe ser un correo válido' })
  email!: string;
}

// ADR-033: el token del enlace del correo y la contraseña nueva, con las mismas reglas del registro.
export class ResetPasswordDto {
  @IsString({ message: 'debe ser texto' })
  @Length(1, 200, { message: 'debe tener entre 1 y 200 caracteres' })
  token!: string;

  @IsString({ message: 'debe ser texto' })
  @Length(PASSWORD_LENGTH.min, PASSWORD_LENGTH.max, { message: PASSWORD_MESSAGE })
  password!: string;
}

// ADR-033: cambiar la contraseña desde la sesión. currentPassword es obligatoria si la cuenta tiene
// contraseña (sin ella, 403 INVALID_PASSWORD) y se omite en una cuenta de Google.
export class ChangePasswordDto {
  @IsOptional()
  @IsString({ message: 'debe ser texto' })
  @MaxLength(128, { message: 'debe tener como máximo 128 caracteres' })
  currentPassword?: string;

  @IsString({ message: 'debe ser texto' })
  @Length(PASSWORD_LENGTH.min, PASSWORD_LENGTH.max, { message: PASSWORD_MESSAGE })
  newPassword!: string;
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
