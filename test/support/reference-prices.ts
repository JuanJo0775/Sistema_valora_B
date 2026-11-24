import type { INestApplication } from '@nestjs/common';
import { ImportInitialPrices } from '../../src/modules/comparison';
import { ImportEstablishments } from '../../src/modules/establishments';

// ADR-037: un precio oficial se compara con la mediana de al menos 3 tiendas del municipio (ADR-030).
// Estas pruebas crean tres tiendas «vecinas» (el municipio por defecto es Armenia) con un precio
// inicial de la semilla para cada presentación. Quedan a unos 11 km de la tienda de prueba para no
// aparecer en las comparaciones de cerca que revisan otras pruebas.
export async function seedReferencePrices(
  app: INestApplication,
  options: {
    // Ocho caracteres hexadecimales: prefijo de los ids de las tiendas de referencia.
    idPrefix: string;
    presentationIds: string[];
    priceCop: number;
    near: { lat: number; lng: number };
  },
): Promise<string[]> {
  const storeIds = [1, 2, 3].map(
    (n) => `${options.idPrefix}-0000-4000-8000-00000000000${String(n)}`,
  );
  for (const [index, id] of storeIds.entries()) {
    await app.get(ImportEstablishments).save({
      id,
      name: `Tienda de referencia ${String(index + 1)}`,
      type: 'barrio',
      lat: options.near.lat + 0.1 + index * 0.001,
      lng: options.near.lng,
    });
  }
  await app.get(ImportInitialPrices).execute(
    options.presentationIds.flatMap((presentationId) =>
      storeIds.map((establishmentId) => ({
        id: crypto.randomUUID(),
        presentationId,
        establishmentId,
        priceCop: options.priceCop,
        observedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        sourceUrl: 'https://ejemplo.test/referencia',
      })),
    ),
  );
  return storeIds;
}
