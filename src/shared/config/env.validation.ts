import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, validateSync } from 'class-validator';

export class Env {
  @IsInt()
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

  @IsIn(['development', 'test', 'production'])
  NODE_ENV!: string;
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
