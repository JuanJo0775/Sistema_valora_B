CREATE TABLE "comparison"."verified_merchants" (
	"establishment_id" uuid PRIMARY KEY NOT NULL
);

-- Relleno único: los comercios que ya estaban verificados antes de existir esta copia. Desde aquí la
-- mantienen los eventos MerchantVerified, MerchantRevoked y MerchantLeft.
INSERT INTO "comparison"."verified_merchants" ("establishment_id")
SELECT "establishment_id" FROM "commerce"."merchant_claims" WHERE "status" = 'verificado'
ON CONFLICT DO NOTHING;
