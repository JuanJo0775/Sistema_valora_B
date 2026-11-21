import 'reflect-metadata';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsString,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

export class Env {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL_TEST!: string;

  @IsString()
  @IsNotEmpty()
  SESSION_SECRET!: string;

  // Grill de la #31, pregunta 2: firma la clave seudónima del reportante (aparte de la sesión).
  @IsString()
  @IsNotEmpty()
  REPORTER_KEY_SECRET!: string;

  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;

  // Repartidor de eventos (ADR-015, grill de la #43): valores iniciales calibrables, no umbrales aprobados.
  @IsInt()
  @Min(1)
  OUTBOX_POLL_INTERVAL_MS!: number;

  @IsInt()
  @Min(1)
  OUTBOX_MAX_ATTEMPTS!: number;

  // ADR-020 (#88): carpeta de las fotos subidas (fuera de Git) y su dirección pública, hasta ADR-012.
  @IsString()
  @IsNotEmpty()
  MEDIA_DIR!: string;

  @IsString()
  @IsNotEmpty()
  MEDIA_PUBLIC_URL!: string;

  // ADR-012: cuántos proxies hay delante de la API para leer la IP real del cliente (request.ip).
  // En producción son 2 (Vercel y Render); en desarrollo 0, donde X-Forwarded-For no se cree.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY: number = 0;

  // ADR-022: Supabase Storage guarda las fotos que sube el moderador. Sin SUPABASE_URL se usa la
  // carpeta local (desarrollo). La clave secreta solo vive en el entorno de la API (RN2).
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  SUPABASE_URL?: string;

  @ValidateIf((env: Env) => env.SUPABASE_URL !== undefined)
  @IsString()
  @IsNotEmpty()
  SUPABASE_SECRET_KEY?: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_BUCKET: string = 'productos';

  // ADR-029: correo de verificación. Con «console» (por defecto) el mensaje solo se muestra en el
  // registro de desarrollo; con «resend» se envía de verdad y las otras tres variables son
  // obligatorias. La clave solo vive en el entorno de la API.
  @IsIn(['console', 'resend'])
  EMAIL_PROVIDER: string = 'console';

  @ValidateIf((env: Env) => env.EMAIL_PROVIDER === 'resend')
  @IsString()
  @IsNotEmpty()
  EMAIL_API_KEY?: string;

  @ValidateIf((env: Env) => env.EMAIL_PROVIDER === 'resend')
  @IsString()
  @IsNotEmpty()
  EMAIL_FROM?: string;

  // Si registrar precios exige el correo verificado. Se pone en false mientras no haya proveedor de
  // correo (en producción, con EMAIL_PROVIDER=console, nadie recibiría el enlace).
  // Se lee el valor original: la conversión implícita volvería true el texto «false».
  @Transform(({ obj }: { obj: Record<string, unknown> }) => {
    const raw = obj['REQUIRE_VERIFIED_EMAIL'];
    return raw === undefined || raw === 'true' ? true : raw === 'false' ? false : raw;
  })
  @IsBoolean()
  REQUIRE_VERIFIED_EMAIL: boolean = true;

  // Base pública de los enlaces del correo: la dirección de la PWA, sin barra final.
  @ValidateIf((env: Env) => env.EMAIL_PROVIDER === 'resend' || env.APP_URL !== undefined)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  APP_URL?: string;

  // ADR-029, fase 2 (#181): inicio de sesión con Google. Las tres o ninguna: sin ellas la API arranca y
  // las rutas de Google responden 404. El secreto solo va en el panel de Render, nunca en Git.
  @Transform(emptyAsAbsent)
  @ValidateIf(hasGoogleConfig)
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID?: string;

  @Transform(emptyAsAbsent)
  @ValidateIf(hasGoogleConfig)
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET?: string;

  @Transform(emptyAsAbsent)
  @ValidateIf(hasGoogleConfig)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  GOOGLE_REDIRECT_URI?: string;
}

// #182: un panel de variables puede dejarlas creadas pero vacías; vacía cuenta como ausente.
function emptyAsAbsent({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

function hasGoogleConfig(env: Env): boolean {
  return (
    env.GOOGLE_CLIENT_ID !== undefined ||
    env.GOOGLE_CLIENT_SECRET !== undefined ||
    env.GOOGLE_REDIRECT_URI !== undefined
  );
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: true });
  const errors = validateSync(env, { skipMissingProperties: false });

  if (errors.length > 0) {
    const detalle = errors.map(
      (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Variables de entorno inválidas:\n- ${detalle.join('\n- ')}`);
  }

  // Exigir verificación sin poder enviar el enlace bloquearía todos los reportes.
  if (
    env.NODE_ENV === 'production' &&
    env.REQUIRE_VERIFIED_EMAIL &&
    env.EMAIL_PROVIDER === 'console'
  ) {
    throw new Error(
      'Variables de entorno inválidas:\n- REQUIRE_VERIFIED_EMAIL: en producción con EMAIL_PROVIDER=console nadie recibiría el enlace; configura el proveedor de correo o pon REQUIRE_VERIFIED_EMAIL=false',
    );
  }

  return env;
}
