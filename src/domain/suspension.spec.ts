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
});
