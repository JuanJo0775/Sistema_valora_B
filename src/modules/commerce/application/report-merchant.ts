import { randomUUID } from 'node:crypto';
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

// D2 del grill comercial: cualquier cuenta denuncia «este comercio no es de quien dice»; el moderador
// decide (revocar o descartar).
export class ReportMerchant {
  constructor(private readonly ports: ReportMerchantPorts) {}

  async execute(request: ReportMerchantRequest): Promise<{ id: string; status: 'pendiente' }> {
    const id = randomUUID();
    await this.ports.cases.open({
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
