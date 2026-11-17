terraform {
  required_version = ">= 1.6"

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.18"
    }
  }
}

# La clave de la API de Neon se lee de la variable de entorno NEON_API_KEY; no se escribe aquí (RN2).
provider "neon" {}
