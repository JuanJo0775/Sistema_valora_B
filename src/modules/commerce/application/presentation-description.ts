// H3: cómo se nombra una presentación en el portal, del catálogo canónico (no de la lista pública,
// que se actualiza con retraso). Los ids que el catálogo no conoce se leen con un texto neutro.
export interface PresentationDescription {
  productName: string;
  presentationLabel: string;
}

export interface PresentationNamesPort {
  namesOf(presentationIds: string[]): Promise<Map<string, PresentationDescription>>;
}

const UNKNOWN: PresentationDescription = {
  productName: 'Producto sin nombre',
  presentationLabel: '',
};

// Una sola consulta por lote: devuelve cómo describir cada id, repetidos o no.
export async function describePresentations(
  names: PresentationNamesPort,
  presentationIds: string[],
): Promise<(presentationId: string) => PresentationDescription> {
  const found = await names.namesOf([...new Set(presentationIds)]);
  return (presentationId) => found.get(presentationId) ?? UNKNOWN;
}
