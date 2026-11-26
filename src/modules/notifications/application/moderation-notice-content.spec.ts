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
});
