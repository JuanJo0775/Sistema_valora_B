import { contentOf } from './moderation-notice-content';

// ADR-044: el aviso es un texto genérico, sin nombres ni datos de nadie (EC-08).
describe('contenido del aviso a moderación (ADR-044)', () => {
  it('el aviso de precios dice que hay casos nuevos y lleva a la pestaña de precios', () => {
    expect(contentOf('precios')).toEqual({
      title: 'Valora',
      body: 'Hay casos nuevos para revisar en Precios',
      url: '/moderacion?vista=precios',
      // La misma etiqueta agrupa los avisos de una cola en una sola notificación.
      tag: 'moderacion-precios',
    });
  });

  it('el aviso de tiendas lleva a la pestaña de tiendas, con su propia etiqueta', () => {
    expect(contentOf('tiendas')).toEqual({
      title: 'Valora',
      body: 'Hay casos nuevos para revisar en Tiendas',
      url: '/moderacion?vista=tiendas',
      tag: 'moderacion-tiendas',
    });
  });

  it('el aviso de productos lleva a la pestaña de productos, con su propia etiqueta', () => {
    expect(contentOf('productos')).toEqual({
      title: 'Valora',
      body: 'Hay casos nuevos para revisar en Productos',
      url: '/moderacion?vista=productos',
      tag: 'moderacion-productos',
    });
  });

  it('el aviso de comercios lleva a la pestaña de comercios, con su propia etiqueta', () => {
    expect(contentOf('comercios')).toEqual({
      title: 'Valora',
      body: 'Hay casos nuevos para revisar en Comercios',
      url: '/moderacion?vista=comercios',
      tag: 'moderacion-comercios',
    });
  });
});
