import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/domain-error';
import type { MerchantCaseRepository } from './merchant-cases';
import type { MerchantClaimRepository } from './merchant-claims';

export interface ReportMerchantPorts {
  claims: Pick<MerchantClaimRepository, 'ownerOf'>;
  cases: MerchantCaseRepository;
  clock: { now(): Date };
}

export interface ReportMerchantRequest {
  establishmentId: string;
  accountId: string;
  // Clave seudónima de quien denuncia (EC-08).
  reporterKey: string;
  reason: string;
}

// La tienda no tiene un comercio verificado ni pre-aprobado: la capa HTTP la traduce a 404.
export class MerchantNotFoundError extends Error {
  constructor() {
    super('Esta tienda no tiene un comercio registrado.');
    this.name = 'MerchantNotFoundError';
  }
}

// Precisión de D3: nadie denuncia su propia tienda (422).
export class OwnEstablishmentError extends DomainError {
  readonly code = 'OWN_ESTABLISHMENT';

  constructor() {
    super('No puedes denunciar tu propia tienda.');
  }
}

// Precisión de D3: una denuncia abierta por cuenta y tienda (409).
export class MerchantReportOpenError extends Error {
  readonly code = 'MERCHANT_REPORT_OPEN';

  constructor() {
    super('Ya denunciaste este comercio; el moderador lo está revisando.');
    this.name = 'MerchantReportOpenError';
  }
}

// D2 del grill comercial: cualquier cuenta denuncia «este comercio no es de quien dice»; el moderador
// decide (revocar o descartar).
export class ReportMerchant {
  constructor(private readonly ports: ReportMerchantPorts) {}

  async execute(request: ReportMerchantRequest): Promise<{ id: string; status: 'pendiente' }> {
    const { claims, cases } = this.ports;
    const owner = await claims.ownerOf(request.establishmentId);
    if (owner === null) throw new MerchantNotFoundError();
    if (owner === request.accountId) throw new OwnEstablishmentError();
    if (await cases.hasOpen(request.establishmentId, request.reporterKey)) {
      throw new MerchantReportOpenError();
    }
    const id = randomUUID();
    await cases.open({
      id,
      establishmentId: request.establishmentId,
      kind: 'denuncia',
      reporterKey: request.reporterKey,
      reason: request.reason.trim(),
      createdAt: this.ports.clock.now(),
    });
    return { id, status: 'pendiente' };
  }
}
