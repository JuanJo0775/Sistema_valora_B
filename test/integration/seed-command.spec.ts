import { NestFactory } from '@nestjs/core';
import { ImportInitialPrices } from '../../src/modules/comparison';
import { RunSeed, SeedInitialPrices } from '../../src/modules/imports';
import { SeedModule } from '../../src/seed';

// Error encontrado el 15-nov-2026: desde la #26, catalog depende de identity, que necesita el bus de
// eventos; el comando pnpm db:seed no arrancaba. Esta prueba arranca el mismo módulo que el comando.
describe('pnpm db:seed arranca', () => {
  it('el módulo del comando resuelve todas sus dependencias y ofrece RunSeed', async () => {
    const context = await NestFactory.createApplicationContext(SeedModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      expect(context.get(RunSeed)).toBeInstanceOf(RunSeed);
      // B#135: los datos iniciales se preparan en imports y se guardan en comparison.
      expect(context.get(SeedInitialPrices)).toBeInstanceOf(SeedInitialPrices);
      expect(context.get(ImportInitialPrices)).toBeInstanceOf(ImportInitialPrices);
    } finally {
      await context.close();
    }
  });
});
