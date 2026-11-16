import { isMunicipality, MUNICIPALITIES } from './municipality';

// Grill de la #106, pregunta 1 (RF-009 RN5): lista cerrada de los municipios del Quindío.
describe('municipios del Quindío (#106)', () => {
  it('son los 12, con un código estable y su nombre', () => {
    expect(MUNICIPALITIES).toHaveLength(12);
    expect(MUNICIPALITIES).toContainEqual({ code: 'armenia', name: 'Armenia' });
    expect(MUNICIPALITIES).toContainEqual({ code: 'la-tebaida', name: 'La Tebaida' });
  });

  it('reconoce un código de la lista y rechaza lo demás', () => {
    expect(isMunicipality('calarca')).toBe(true);
    expect(isMunicipality('Calarcá')).toBe(false);
    expect(isMunicipality('pereira')).toBe(false);
  });
});
