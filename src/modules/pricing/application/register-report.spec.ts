import { InvalidObservationDateError } from '../../../domain/freshness';
import type { DomainEvent } from '../../../shared/events';
import type { NewReport, RecentReport, ReportRepository, SavedReport } from './report-repository';
import {
  IdempotencyKeyReusedError,
  RegisterReport,
  UnknownEstablishmentError,
  UnknownPresentationError,
} from './register-report';

const presentationId = '11111111-1111-4111-8111-111111111111';
const establishmentId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-11-12T14:00:00Z');

// Repositorio en memoria: doble del puerto, sin base de datos.
class InMemoryReportRepository implements ReportRepository {
  readonly reports: NewReport[] = [];
  readonly events: DomainEvent[] = [];

  findByIdempotencyKey(key: string): Promise<NewReport | null> {
    return Promise.resolve(this.reports.find((report) => report.idempotencyKey === key) ?? null);
  }

  save(report: NewReport, events: DomainEvent[]): Promise<SavedReport> {
    this.reports.push(report);
    this.events.push(...events);
    return Promise.resolve({ report, created: true });
  }

  recentOf(reporterId: string, since: Date): Promise<RecentReport[]> {
    return Promise.resolve(
      this.reports
        .filter((report) => report.reporterId === reporterId && report.receivedAt > since)
        .map(({ id, presentationId, establishmentId, receivedAt }) => ({
          id,
          presentationId,
          establishmentId,
          receivedAt,
        })),
    );
  }
}

function setup() {
  const reports = new InMemoryReportRepository();
  const registerReport = new RegisterReport({
    reports,
    presentations: { exists: (id) => Promise.resolve(id === presentationId) },
    establishments: { exists: (id) => Promise.resolve(id === establishmentId) },
    reporters: {
      of: () => Promise.resolve({ reporterKey: 'clave-seudonima', reporterSince: '2026-11-01' }),
    },
    clock: { now: () => now },
  });
  return { reports, registerReport };
}

const reporterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const report = {
  reporterId,
  presentationId,
  establishmentId,
  priceCop: 4500,
  priceType: 'normal' as const,
  observedAt: new Date('2026-11-12T13:30:00Z'),
};

describe('registrar un reporte de precio', () => {
  it('lo recibe con estado recibido y la hora del servidor como hora de llegada', async () => {
    const { reports, registerReport } = setup();

    const result = await registerReport.execute({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      report,
    });

    expect(result).toEqual({
      created: true,
      receipt: { id: expect.any(String) as string, status: 'recibido', receivedAt: now },
    });
    expect(reports.reports[0]).toMatchObject({ ...report, receivedAt: now });
  });

  it('rechaza una presentación o una tienda que no existen, sin guardar nada', async () => {
    const { reports, registerReport } = setup();
    const missing = '99999999-9999-4999-8999-999999999999';

    await expect(
      registerReport.execute({
        idempotencyKey: '44444444-4444-4444-8444-444444444444',
        report: { ...report, presentationId: missing },
      }),
    ).rejects.toThrow(UnknownPresentationError);
    await expect(
      registerReport.execute({
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        report: { ...report, establishmentId: missing },
      }),
    ).rejects.toThrow(UnknownEstablishmentError);
    expect(reports.reports).toHaveLength(0);
  });

  it('rechaza un precio visto en el futuro, sin guardar nada', async () => {
    const { reports, registerReport } = setup();

    await expect(
      registerReport.execute({
        idempotencyKey: '66666666-6666-4666-8666-666666666666',
        report: { ...report, observedAt: new Date('2026-11-12T14:10:00Z') },
      }),
    ).rejects.toThrow(InvalidObservationDateError);
    expect(reports.reports).toHaveLength(0);
  });

  it('un reintento con la misma clave y el mismo reporte devuelve el recibo original sin duplicar', async () => {
    const { reports, registerReport } = setup();
    const command = { idempotencyKey: '77777777-7777-4777-8777-777777777777', report };

    const first = await registerReport.execute(command);
    const retry = await registerReport.execute(command);

    expect(retry).toEqual({ receipt: first.receipt, created: false });
    expect(reports.reports).toHaveLength(1);
    expect(reports.events).toHaveLength(1);
  });

  it('la misma clave con otro reporte se rechaza como clave reutilizada', async () => {
    const { reports, registerReport } = setup();
    const idempotencyKey = '88888888-8888-4888-8888-888888888888';

    await registerReport.execute({ idempotencyKey, report });

    await expect(
      registerReport.execute({ idempotencyKey, report: { ...report, priceCop: 5000 } }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
    expect(reports.reports).toHaveLength(1);
  });

  it('guarda la cuenta que lo reportó; la misma clave usada por otra cuenta es un conflicto', async () => {
    const { reports, registerReport } = setup();
    const idempotencyKey = '99999999-9999-4999-8999-111111111111';

    await registerReport.execute({ idempotencyKey, report });

    expect(reports.reports[0]?.reporterId).toBe(reporterId);
    await expect(
      registerReport.execute({
        idempotencyKey,
        report: { ...report, reporterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      }),
    ).rejects.toThrow(IdempotencyKeyReusedError);
  });
});
