import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/database/database.module';
import { EstablishmentDetails, EstablishmentsModule } from '../establishments';
import { GrantMerchantRole, IdentityModule } from '../identity';
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
      inject: [DATABASE, EstablishmentDetails, GrantMerchantRole],
      useFactory: (
        db: Database,
        establishments: EstablishmentDetails,
        roles: GrantMerchantRole,
      ): ClaimEstablishment =>
        new ClaimEstablishment({
          establishments,
          claims: new DrizzleMerchantClaimRepository(db),
          roles: { grantMerchant: (accountId) => roles.execute(accountId) },
          clock: { now: () => new Date() },
        }),
    },
    {
      provide: MerchantProfile,
      inject: [DATABASE, EstablishmentDetails],
      useFactory: (db: Database, establishments: EstablishmentDetails): MerchantProfile =>
        new MerchantProfile({ claims: new DrizzleMerchantClaimRepository(db), establishments }),
    },
  ],
})
export class CommerceModule {}
