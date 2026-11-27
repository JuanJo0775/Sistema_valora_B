import { isMunicipality, MUNICIPALITIES, suggestedMunicipality } from './municipality';

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

// H16: el municipio que escribe quien propone no se contrasta con límites oficiales (no los hay), sino
// con el centro de cada cabecera: sirve para avisar a moderación, nunca para rechazar.
describe('municipio que no cuadra con la ubicación (H16)', () => {
  it('la ubicación de La Tebaida declarada como Armenia sugiere La Tebaida', () => {
    expect(suggestedMunicipality('armenia', { lat: 4.4500501, lng: -75.7922013 })).toBe(
      'la-tebaida',
    );
  });

  it('una ubicación de Armenia declarada como Armenia no sugiere nada', () => {
    expect(suggestedMunicipality('armenia', { lat: 4.5339, lng: -75.6811 })).toBeUndefined();
  });

  it('un punto casi a mitad de camino entre dos municipios no se cuestiona', () => {
    // Entre Armenia y Calarcá: la frontera real puede estar a un lado u otro.
    expect(suggestedMunicipality('armenia', { lat: 4.5315, lng: -75.6625 })).toBeUndefined();
    expect(suggestedMunicipality('calarca', { lat: 4.5315, lng: -75.6625 })).toBeUndefined();
  });

  it('un municipio declarado lejos de la ubicación sugiere el más cercano', () => {
    expect(suggestedMunicipality('salento', { lat: 4.5339, lng: -75.6811 })).toBe('armenia');
  });
});
