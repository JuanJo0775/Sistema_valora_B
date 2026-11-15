CREATE TABLE "reliability"."bursts" (
	"report_id" uuid PRIMARY KEY NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
