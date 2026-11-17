variable "project_name" {
  description = "Nombre del proyecto en Neon."
  type        = string
  default     = "valora"
}

variable "org_id" {
  description = "Identificador de la organización de Neon (org-...), visible en la dirección de la consola. Null en una cuenta personal sin organización."
  type        = string
  default     = null
}

variable "region_id" {
  description = "Región de Neon. Igual que la de Render (virginia) para tener poca latencia entre la API y la base."
  type        = string
  default     = "aws-us-east-1"
}

variable "pg_version" {
  description = "Versión mayor de PostgreSQL. El equipo desarrolla con 17 (docs/DECISIONS.md)."
  type        = number
  default     = 17
}

variable "database_name" {
  description = "Nombre de la base de datos de la aplicación."
  type        = string
  default     = "valora"
}

variable "role_name" {
  description = "Rol dueño de la base de datos."
  type        = string
  default     = "valora_owner"
}
