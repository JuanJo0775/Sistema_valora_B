import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import {
  fetchSeedImages,
  imagesSummary,
  OpenFoodFactsImages,
  ProductsCsvFile,
} from './modules/imports';

// pnpm seed:imagenes (#119, ADR-020): llena en seed/productos.csv el enlace de la foto de Open Food
// Facts de los productos con código de barras. Es para el equipo: no corre en el servidor ni usa
// la base. Después de revisar el CSV, pnpm db:seed carga las fotos.
async function main(): Promise<void> {
  const logger = new Logger('Fotos');
  const off = new OpenFoodFactsImages();
  try {
    const report = await fetchSeedImages(new ProductsCsvFile(join(process.cwd(), 'seed')), (code) =>
      off.find(code),
    );
    for (const line of imagesSummary(report)) logger.log(line);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
