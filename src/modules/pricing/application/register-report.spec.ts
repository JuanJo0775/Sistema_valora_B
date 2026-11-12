import type { DomainEvent } from '../../../shared/events';
import type { NewReport, ReportRepository, SavedReport } from './report-repository';
import { RegisterReport } from './register-report';

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

  save(report: NewReport, event: DomainEvent): Promise<SavedReport> {
    this.reports.push(report);
    this.events.push(event);
    return Promise.resolve({ report, created: true });
  }
}

function setup() {
  const reports = new InMemoryReportRepository();
  const registerReport = new RegisterReport({
    reports,
    presentations: { exists: (id) => Promise.resolve(id === presentationId) },
    establishments: { exists: (id) => Promise.resolve(id === establishmentId) },
    clock: { now: () => now },
  });
  return { reports, registerReport };
}

const report = {
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
});
