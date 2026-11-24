import type { PreviewOlimpica } from './preview-olimpica';

type PreviewResult = Awaited<ReturnType<PreviewOlimpica['execute']>>;
type PreviewRow = PreviewResult['rows'][number];
type ConfirmedRow = Extract<PreviewRow, { status: 'available' | 'unavailable' }>;

export type OnlineObservation = ConfirmedRow & {
  source: 'olimpica_vtex';
  zoneId: string;
  runId: string;
};

export async function applyOlimpica(
  preview: PreviewResult,
  runId: string,
  save: (observation: OnlineObservation) => Promise<OnlineObservation>,
) {
  const rows: PreviewRow[] = [];
  for (const row of preview.rows) {
    if (row.status === 'available' || row.status === 'unavailable') {
      try {
        const saved = await save({
          ...row,
          source: 'olimpica_vtex',
          zoneId: preview.zoneId,
          runId,
        });
        {
          const { ean, presentationId, skuId, sellerId, observedAt, status } = saved;
          const base = { ean, presentationId, skuId, sellerId, observedAt };
          rows.push(
            status === 'available'
              ? { ...base, status, priceCop: saved.priceCop, expiresAt: saved.expiresAt }
              : { ...base, status },
          );
          continue;
        }
      } catch {
        rows.push({ ean: row.ean, status: 'failed', reason: 'persistence_error' });
        continue;
      }
    }
    rows.push(row);
  }
  return { mode: 'apply' as const, zoneId: preview.zoneId, runId, rows };
}
