import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { OutboxPublisher } from '../../shared/events';
import { CatalogModule, PresentationExists } from '../catalog';
import { EstablishmentExists, EstablishmentsModule } from '../establishments';
import { IdentityModule, ReporterIdentity } from '../identity';
import { RegisterReport } from './application/register-report';
import { REPORT_REPOSITORY, type ReportRepository } from './application/report-repository';
import { ReportsController } from './http/reports.controller';
import { DrizzleReportRepository } from './infrastructure/drizzle-report-repository';

@Module({
  imports: [CatalogModule, EstablishmentsModule, IdentityModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: REPORT_REPOSITORY,
      inject: [DATABASE, OutboxPublisher],
      useFactory: (db: Database, outbox: OutboxPublisher): ReportRepository =>
        new DrizzleReportRepository(db, outbox),
    },
    {
      provide: RegisterReport,
      inject: [REPORT_REPOSITORY, PresentationExists, EstablishmentExists, ReporterIdentity],
      useFactory: (
        reports: ReportRepository,
        presentations: PresentationExists,
        establishments: EstablishmentExists,
        reporters: ReporterIdentity,
      ): RegisterReport =>
        new RegisterReport({
          reports,
          presentations,
          establishments,
          reporters,
          clock: { now: () => new Date() },
        }),
    },
  ],
})
export class PricingModule {}
