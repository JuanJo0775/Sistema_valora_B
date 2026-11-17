import { Test } from '@nestjs/testing';

describe('arranque sin base de datos disponible', () => {
  const originalUrl = process.env['DATABASE_URL_TEST'];

  afterEach(() => {
    process.env['DATABASE_URL_TEST'] = originalUrl;
  });

  it('la API no arranca y el mensaje dice host, puerto y base, pero no la contraseña', async () => {
    // Puerto 1: nadie escucha ahí, así que la conexión se rechaza.
    process.env['DATABASE_URL_TEST'] = 'postgresql://valora:clave-secreta@localhost:1/valora_test';

    await jest.isolateModulesAsync(async () => {
      // AppModule se importa después de cambiar la variable, porque ConfigModule la lee al cargarse.
      const { AppModule } = await import('../../src/app.module');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication({ logger: false });

      const startup = app.init();

      await expect(startup).rejects.toThrow(
        /No se pudo conectar a la base de datos valora_test en localhost:1/,
      );
      await expect(startup).rejects.not.toThrow(/clave-secreta/);
    });
  });
});
