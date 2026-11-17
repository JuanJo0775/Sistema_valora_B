import { randomUUID } from 'node:crypto';

// Contrato de evento (ADR-015): tipo y versión estables; un cambio de forma exige una versión nueva.
export interface DomainEvent {
  id: string;
  type: string;
  version: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
}

export function createEvent(
  type: string,
  version: number,
  payload: Record<string, unknown>,
): DomainEvent {
  return { id: randomUUID(), type, version, occurredAt: new Date(), payload };
}
