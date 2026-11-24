ALTER TABLE "identity"."accounts" ADD COLUMN "welcome_email_sent_at" timestamp with time zone;--> statement-breakpoint
-- ADR-036: las cuentas que ya existen no reciben la bienvenida con retraso; solo las nuevas.
UPDATE "identity"."accounts" SET "welcome_email_sent_at" = now();
