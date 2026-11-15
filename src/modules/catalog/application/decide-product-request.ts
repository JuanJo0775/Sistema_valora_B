import { DomainError } from '../../../domain/domain-error';
import { assertSameBase } from '../../../domain/unit-price';
import type { ProductRepository } from './product-repository';
import type { ProductRequestDecision, ProductRequestRepository } from './product-requests';
import { BarcodeTakenError } from './request-product';

export interface DecideProductRequestPorts {
  requests: Pick<ProductRequestRepository, 'pending' | 'decide'>;
  products: Pick<ProductRepository, 'findById' | 'findByBarcode'>;
  clock: { now(): Date };
}

export interface ProductRequestDecisionRequest {
  requestId: string;
  decision: ProductRequestDecision;
  mergeInto?: string;
  note: string;
  // Clave seudónima del moderador (EC-08).
  moderatorKey: string;
}

// Grill de la #26, pregunta 3: el motivo es obligatorio, como en las tiendas propuestas (#27).
export const REQUEST_NOTE_LENGTH = { min: 10, max: 500 } as const;

// Dato de entrada inválido: la capa HTTP lo traduce a 400.
export class InvalidRequestNoteError extends Error {
  constructor() {
    super(
      `El motivo es obligatorio, de ${String(REQUEST_NOTE_LENGTH.min)} a ${String(REQUEST_NOTE_LENGTH.max)} caracteres.`,
    );
    this.name = 'InvalidRequestNoteError';
  }
}

// No existe o ya se decidió: la capa HTTP lo traduce a 404.
export class ProductRequestNotFoundError extends Error {
  constructor() {
    super('La propuesta no existe o ya se decidió.');
    this.name = 'ProductRequestNotFoundError';
  }
}

// Solo se fusiona con un producto que existe (422).
export class MergeProductNotFoundError extends DomainError {
  readonly code = 'UNKNOWN_PRODUCT';

  constructor() {
    super('El producto con el que se quiere fusionar no existe.');
  }
}

// RF-003 RN3: el moderador aprueba (aparece en la búsqueda), fusiona o rechaza un producto propuesto.
export class DecideProductRequest {
  constructor(private readonly ports: DecideProductRequestPorts) {}

  async execute(request: ProductRequestDecisionRequest): Promise<void> {
    const note = request.note.trim();
    if (note.length < REQUEST_NOTE_LENGTH.min || note.length > REQUEST_NOTE_LENGTH.max) {
      throw new InvalidRequestNoteError();
    }
    const { requests, products, clock } = this.ports;
    const proposal = (await requests.pending()).find((item) => item.id === request.requestId);
    if (!proposal) throw new ProductRequestNotFoundError();

    if (request.decision !== 'rechazar' && proposal.barcode) {
      // RF-003 RN2: otro producto pudo tomar el código mientras la propuesta esperaba.
      const [owner] = await products.findByBarcode(proposal.barcode);
      if (owner) throw new BarcodeTakenError(owner.id);
    }
    if (request.decision === 'fusionar') {
      const target = request.mergeInto ? await products.findById(request.mergeInto) : null;
      if (!target) throw new MergeProductNotFoundError();
      // Issue #59: la presentación que se agrega comparte la base de las que ya tiene.
      assertSameBase([...target.presentations.map(({ unit }) => unit), proposal.unit]);
    }

    const decided = await requests.decide({
      requestId: request.requestId,
      decision: request.decision,
      ...(request.decision === 'fusionar' && request.mergeInto
        ? { mergeInto: request.mergeInto }
        : {}),
      note,
      moderatorKey: request.moderatorKey,
      decidedAt: clock.now(),
    });
    // Otro moderador la decidió entre la lectura y la escritura.
    if (!decided) throw new ProductRequestNotFoundError();
  }
}
