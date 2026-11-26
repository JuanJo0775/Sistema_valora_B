import { Module } from '@nestjs/common';
import { CatalogModule, ProductRequestsQueue } from '../modules/catalog';
import { CommerceModule, MerchantCasesQueue } from '../modules/commerce';
import {
  EstablishmentsModule,
  StoreCorrectionsQueue,
  StoreProposalsQueue,
} from '../modules/establishments';
import { IdentityModule } from '../modules/identity';
import { ModerationQueue, ReliabilityModule } from '../modules/reliability';
import { ModerationSummary } from './moderation-summary';
import { ModerationSummaryController } from './moderation-summary.controller';

// Reúne los conteos de las colas de cuatro módulos. Vive fuera de src/modules porque el núcleo
// (reliability) no puede conocer a commerce (EC-05); aquí solo se importa por los index.ts.
@Module({
  imports: [IdentityModule, ReliabilityModule, EstablishmentsModule, CatalogModule, CommerceModule],
  controllers: [ModerationSummaryController],
  providers: [
    {
      provide: ModerationSummary,
      inject: [
        ModerationQueue,
        StoreProposalsQueue,
        StoreCorrectionsQueue,
        ProductRequestsQueue,
        MerchantCasesQueue,
      ],
      useFactory: (
        prices: ModerationQueue,
        storeProposals: StoreProposalsQueue,
        storeCorrections: StoreCorrectionsQueue,
        productRequests: ProductRequestsQueue,
        merchantCases: MerchantCasesQueue,
      ): ModerationSummary =>
        new ModerationSummary({
          prices,
          storeProposals,
          storeCorrections,
          productRequests,
          merchantCases,
        }),
    },
  ],
})
export class ModerationSummaryModule {}
