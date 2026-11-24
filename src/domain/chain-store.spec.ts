import { claimPathFor, CHAIN_NAMES, isChainStore } from './chain-store';

describe('tiendas de cadena (H11, ADR-037)', () => {
  it.each(['D1', 'Ara', 'Éxito', 'Olímpica', 'Carulla'])('reconoce %s por su nombre', (name) => {
    expect(isChainStore(name, 'supermercado')).toBe(true);
  });

  it('el tipo descuento es de cadena aunque el nombre no diga cuál', () => {
    expect(isChainStore('Tienda de descuento del centro', 'descuento')).toBe(true);
  });

  it.each([
    'D1 Avenida 19 de Enero',
    'Tienda D1 - La Tebaida',
    'Tiendas D1',
    'ARA Calle 14',
    'exito express',
    'EXITO',
    'Olimpica Express',
    'Súper Inter Las Américas',
    'Super Inter - Circasia',
    'Supertienda Olímpica',
    'Justo & Bueno',
    'Justo y Bueno',
    'PriceSmart',
    'Alkosto',
    'Makro',
    'Jumbo',
    'Metro',
    'Surtimax',
    'Oxxo',
  ])('reconoce «%s» como cadena sin importar mayúsculas ni tildes', (name) => {
    expect(isChainStore(name, 'minimercado')).toBe(true);
  });

  it.each([
    'Panadería D10',
    'D10',
    'Tienda La Esperanza',
    'Miscelánea San José',
    'Supermercado Laureles',
    'Metrocentro Papelería',
    'Mercamos',
    'Carullas del Norte',
    'Aracely',
  ])('«%s» no es una cadena', (name) => {
    expect(isChainStore(name, 'barrio')).toBe(false);
  });

  it('la lista está declarada en un solo lugar y no repite nombres', () => {
    expect(CHAIN_NAMES).toEqual(expect.arrayContaining(['D1', 'Ara', 'Éxito', 'Olímpica']));
    expect(new Set(CHAIN_NAMES).size).toBe(CHAIN_NAMES.length);
  });

  describe('camino del reclamo de una tienda del mapa', () => {
    it('cadena: no se puede reclamar', () => {
      expect(claimPathFor('D1 Centro', 'descuento')).toBe('cadena');
      expect(claimPathFor('Éxito Armenia', 'supermercado')).toBe('cadena');
    });

    it('supermercado que no es cadena: queda pre-aprobado hasta que modere', () => {
      expect(claimPathFor('Supermercado Laureles', 'supermercado')).toBe('revision');
    });

    it('barrio y minimercado: verificación instantánea por cercanía', () => {
      expect(claimPathFor('Tienda La Esperanza', 'barrio')).toBe('inmediata');
      expect(claimPathFor('Minimercado El Veci', 'minimercado')).toBe('inmediata');
    });
  });
});
