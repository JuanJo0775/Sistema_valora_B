import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EstablishmentDetails, EstablishmentsModule } from '../establishments';
import { IdentityModule } from '../identity';
import { OutboxPublisher } from '../../shared/events';
import { ClaimEstablishment } from './application/claim-establishment';
import { MerchantProfile } from './application/merchant-profile';
import { MerchantController } from './http/merchant.controller';
import { DrizzleMerchantClaimRepository } from './infrastructure/drizzle-merchant-claim-repository';

// EPIC-B08: comercios verificados (D1 a D8 del grill comercial). B1, #201: registro y perfil.
@Module({
  imports: [IdentityModule, EstablishmentsModule],
  controllers: [MerchantController],
  providers: [
    {
      provide: ClaimEstablishment,
      inject: [DATABASE, EstablishmentDetails, OutboxPublisher],
      useFactory: (
        db: Database,
        establishments: EstablishmentDetails,
        outbox: OutboxPublisher,
      ): ClaimEstablishment =>
        new ClaimEstablishment({
          establishments,
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantProfile,
      inject: [DATABASE, OutboxPublisher, EstablishmentDetails],
      useFactory: (
        db: Database,
        outbox: OutboxPublisher,
        establishments: EstablishmentDetails,
      ): MerchantProfile =>
        new MerchantProfile({
          claims: new DrizzleMerchantClaimRepository(db, outbox),
          establishments,
        }),
    },
  ],
})
export class CommerceModule {}
