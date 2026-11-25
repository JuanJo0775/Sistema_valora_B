import { createEvent } from '../../../shared/events';
import { departFrom, type MerchantDeparturePorts } from './merchant-departures';
import { MerchantNotVerifiedError } from './publish-official-price';

// H36 (ADR-040): establishments lo recibe y retira la tienda. Solo se publica el nombre.
export const MERCHANT_ESTABLISHMENT_DELETED = 'MerchantEstablishmentDeleted';

// La cuenta no tiene tienda: la capa HTTP lo traduce a 404.
export class NoEstablishmentError extends Error {
  constructor() {
    super('Tu cuenta no tiene una tienda registrada.');
    this.name = 'NoEstablishmentError';
  }
}

// La tienda es del catálogo o la creó otra cuenta: la capa HTTP lo traduce a 403.
export class EstablishmentNotCreatedByAccountError extends Error {
  readonly code = 'ESTABLISHMENT_NOT_CREATED_BY_ACCOUNT';

  constructor() {
    super(
      'Solo puedes eliminar una tienda que registraste como nueva con esta cuenta. Puedes dejar de administrarla.',
    );
    this.name = 'EstablishmentNotCreatedByAccountError';
  }
}

// H36 (ADR-040): quien creó la tienda la elimina del mapa y deja de administrarla.
export class DeleteMyEstablishment {
  constructor(private readonly ports: MerchantDeparturePorts) {}

  async execute(accountId: string): Promise<void> {
    const claim = await this.ports.claims.findByAccount(accountId);
    if (!claim) throw new NoEstablishmentError();
    // Pre-aprobada: la tienda todavía no está en el mapa.
    if (claim.status !== 'verificado') throw new MerchantNotVerifiedError();
    if (claim.createdEstablishment !== true) throw new EstablishmentNotCreatedByAccountError();
    const { establishmentId } = claim;
    const departed = await departFrom(this.ports, claim, 'eliminada', [
      createEvent(MERCHANT_ESTABLISHMENT_DELETED, 1, { establishmentId }),
    ]);
    if (!departed) throw new NoEstablishmentError();
  }
}
