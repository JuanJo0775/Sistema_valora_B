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

  // #213: ninguna tienda queda en el municipio equivocado. La mediana de las tiendas de cada municipio
  // queda cerca de su cabecera; una tienda rural aislada no mueve la mediana.
  it('las tiendas de cada municipio quedan alrededor de su cabecera', async () => {
    const CABECERAS: Record<string, [number, number]> = {
      armenia: [4.5339, -75.6811],
      buenavista: [4.3608, -75.7395],
      calarca: [4.5196, -75.6436],
      circasia: [4.6188, -75.6358],
      cordoba: [4.3915, -75.6876],
      filandia: [4.6747, -75.6583],
      genova: [4.2071, -75.7898],
      'la-tebaida': [4.4525, -75.7881],
      montenegro: [4.5664, -75.7509],
      pijao: [4.3338, -75.7045],
      quimbaya: [4.6232, -75.7626],
      salento: [4.6377, -75.5706],
    };
    const median = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
    };
    // Un grado mide unos 111 km; a esta latitud la longitud casi no se acorta.
    const km = ([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]) =>
      Math.hypot(lat1 - lat2, lng1 - lng2) * 111;

    const rows = await new CsvSeedSource(join(process.cwd(), 'seed')).readStores();
    const byMunicipality = new Map<string, [number, number][]>();
    for (const { values } of rows) {
      const point: [number, number] = [Number(values['lat']), Number(values['lng'])];
      const municipality = values['municipio'] ?? '';
      byMunicipality.set(municipality, [...(byMunicipality.get(municipality) ?? []), point]);
    }

    const far = [...byMunicipality].flatMap(([municipality, points]) => {
      const cabecera = CABECERAS[municipality];
      const center: [number, number] = [
        median(points.map((p) => p[0])),
        median(points.map((p) => p[1])),
      ];
      return cabecera && km(center, cabecera) < 8 ? [] : [municipality];
    });
    expect(far).toEqual([]);
  });
});
