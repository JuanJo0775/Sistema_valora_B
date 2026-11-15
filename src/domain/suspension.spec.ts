import { suspensionAfter } from './suspension';

const decidedAt = new Date('2026-11-14T14:00:00Z');

describe('suspensión preventiva por descartes seguidos (RF-013, RN6)', () => {
  it('el tercer descarte seguido suspende la cuenta', () => {
    expect(suspensionAfter(['descartar', 'descartar', 'descartar'], decidedAt)).not.toBeNull();
  });

  it('con dos descartes todavía no hay suspensión', () => {
    expect(suspensionAfter(['descartar', 'descartar'], decidedAt)).toBeNull();
  });

  it('un aprobar en medio corta la racha', () => {
    expect(
      suspensionAfter(['descartar', 'descartar', 'aprobar', 'descartar'], decidedAt),
    ).toBeNull();
  });

  it('observar las cuentas no suma ni corta la racha', () => {
    expect(
      suspensionAfter(
        ['descartar', 'observar_cuentas', 'descartar', 'observar_cuentas', 'descartar'],
        decidedAt,
      ),
    ).not.toBeNull();
  });

  it.each([4, 5])(
    'el descarte número %i no suspende otra vez: la racha volvió a empezar',
    (count) => {
      expect(suspensionAfter(Array<'descartar'>(count).fill('descartar'), decidedAt)).toBeNull();
    },
  );

  it('el sexto descarte seguido suspende de nuevo', () => {
    expect(suspensionAfter(Array<'descartar'>(6).fill('descartar'), decidedAt)).not.toBeNull();
  });

  it('la suspensión termina 7 días después de la decisión', () => {
    expect(suspensionAfter(['descartar', 'descartar', 'descartar'], decidedAt)).toEqual(
      new Date('2026-11-21T14:00:00Z'),
    );
  });

  it('si la última decisión no es un descarte, no suspende por la racha', () => {
    expect(
      suspensionAfter(['descartar', 'descartar', 'descartar', 'observar_cuentas'], decidedAt),
    ).toBeNull();
  });
});
