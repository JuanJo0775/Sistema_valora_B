# Base de datos de Valora en Neon (ADR-012, RNF-009 RN1): PostgreSQL administrado.
# PostGIS lo activa la migración 0000_enable-postgis (pnpm db:migrate); Neon la trae disponible.
resource "neon_project" "valora" {
  name       = var.project_name
  org_id     = var.org_id
  region_id  = var.region_id
  pg_version = var.pg_version

  # Plan gratuito: la retención de historial no puede superar este valor.
  history_retention_seconds = 21600

  branch {
    name          = "main"
    database_name = var.database_name
    role_name     = var.role_name
  }
}
