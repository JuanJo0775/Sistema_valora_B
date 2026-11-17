# Cadena de conexión con contraseña: es un secreto. Se pega en Render como DATABASE_URL y en el
# secreto NEON_DATABASE_URL de GitHub (docs/despliegue.md). No se imprime en los registros.
output "database_url" {
  description = "DATABASE_URL de la API."
  value       = neon_project.valora.connection_uri
  sensitive   = true
}

output "project_id" {
  description = "Identificador del proyecto en Neon."
  value       = neon_project.valora.id
}
