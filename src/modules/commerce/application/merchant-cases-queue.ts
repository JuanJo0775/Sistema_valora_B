import type { MerchantCase } from './merchant-cases';
import type { MerchantClaim } from './merchant-claims';

export interface MerchantCasesQueuePorts {
  cases: { pending(): Promise<MerchantCase[]> };
  claims: { findByEstablishment(establishmentId: string): Promise<MerchantClaim | null> };
  // La tienda del mapa, por la interfaz pública de establishments.
  establishments: { find(establishmentId: string): Promise<{ name: string } | null> };
}

// Lo que el moderador necesita para decidir; nunca quién abrió el caso ni la cuenta del dueño (EC-08).
export interface MerchantCaseItem {
  id: string;
  kind: MerchantCase['kind'];
  establishment: { id: string; name: string };
  // null si el comercio ya no existe (por ejemplo, otro caso ya lo revocó).
  owner: {
    responsibleName: string;
    nit: string | null;
    phone: string;
    status: MerchantClaim['status'];
    verifiedAt: Date | null;
  } | null;
  reason: string;
  createdAt: Date;
  // H18, solo en las disputas: quien disputa. null si la disputa es anterior a guardar sus datos.
  challenger?: {
    responsibleName: string;
    phone: string;
    nit?: string;
    requestedAt: Date;
  } | null;
  // H18, solo en las denuncias: las denuncias abiertas sobre la tienda, de cuántas cuentas distintas
  // vienen (un número, sin identificarlas) y desde cuándo.
  reportCount?: number;
  distinctReporters?: number;
  firstReportedAt?: Date;
}

// Se calcula con las claves seudónimas, que no salen de aquí (EC-08).
function reportStatsOf(pending: MerchantCase[], { establishmentId, createdAt }: MerchantCase) {
  const reports = pending.filter(
    (found) => found.kind === 'denuncia' && found.establishmentId === establishmentId,
  );
  return {
    reportCount: reports.length,
    distinctReporters: new Set(reports.map((found) => found.reporterKey)).size,
    firstReportedAt: reports.reduce(
      (first, found) => (found.createdAt < first ? found.createdAt : first),
      createdAt,
    ),
  };
}

// Campo por campo: nada más de lo guardado sale en la respuesta.
function challengerOf({ challenger, createdAt }: MerchantCase): MerchantCaseItem['challenger'] {
  if (!challenger) return null;
  const { responsibleName, phone, nit } = challenger;
  return { responsibleName, phone, ...(nit === null ? {} : { nit }), requestedAt: createdAt };
}

// D2 y D3 del grill comercial: denuncias y disputas pendientes, la más antigua primero.
export class MerchantCasesQueue {
  constructor(private readonly ports: MerchantCasesQueuePorts) {}

  // #257: cuántos casos esperan decisión; es el número de la pestaña «Comercios».
  async count(): Promise<number> {
    return (await this.ports.cases.pending()).length;
  }

  async list(): Promise<MerchantCaseItem[]> {
    const { cases, claims, establishments } = this.ports;
    const items: MerchantCaseItem[] = [];
    const pending = await cases.pending();
    for (const merchantCase of pending) {
      const { establishmentId } = merchantCase;
      const store = await establishments.find(establishmentId);
      const claim = await claims.findByEstablishment(establishmentId);
      items.push({
        id: merchantCase.id,
        kind: merchantCase.kind,
        establishment: { id: establishmentId, name: store?.name ?? '' },
        owner: claim && {
          responsibleName: claim.responsibleName,
          nit: claim.nit,
          phone: claim.phone,
          status: claim.status,
          verifiedAt: claim.verifiedAt,
        },
        reason: merchantCase.reason,
        createdAt: merchantCase.createdAt,
        ...(merchantCase.kind === 'disputa' ? { challenger: challengerOf(merchantCase) } : {}),
        ...(merchantCase.kind === 'denuncia' ? reportStatsOf(pending, merchantCase) : {}),
      });
    }
    return items;
  }
}
