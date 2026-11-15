import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

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

  return env;
}
