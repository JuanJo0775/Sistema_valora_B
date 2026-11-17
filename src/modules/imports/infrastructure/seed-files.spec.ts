import { join } from 'node:path';
import { SeedInitialPrices } from '../application/initial-prices';
import { CsvSeedSource } from './csv-seed-source';

// B#135: los CSV reales de seed/ se revisan en cada PR. Si alguien edita precios-iniciales.csv y
// deja una fila inválida, la CI lo dice antes de que pnpm db:seed llegue a la base.
describe('los archivos reales de seed/', () => {
  it('precios-iniciales.csv no tiene errores y cada precio queda en tiendas de su cadena', async () => {
    const result = await new SeedInitialPrices(
      new CsvSeedSource(join(process.cwd(), 'seed')),
    ).read();

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.prices.length).toBeGreaterThan(0);
  });
});
