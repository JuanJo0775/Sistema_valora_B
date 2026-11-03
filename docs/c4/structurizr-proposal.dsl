workspace "Valora" "Propuesta inicial de modelo C4 para revisión del equipo. No constituye una decisión aprobada de herramienta ni una arquitectura implementada." {
    model {
        consumidor = person "Consumidor" "Consulta productos, establecimientos y precios sin crear una cuenta."
        reportante = person "Reportante" "Registra precios observados, incluso cuando pierde conectividad."
        comercio = person "Comercio" "Participa voluntariamente y, en el Corte 3, publica precios oficiales y promociones."
        moderador = person "Moderador" "Revisa reportes dudosos y administra la integridad de la información."

        valora = softwareSystem "Valora" "Plataforma colaborativa de comparación neutral de precios." {
            web = container "Cliente web/PWA" "Interfaz responsiva, consulta pública y cola local para reportes offline." "Web / PWA"
            api = container "Backend modular" "Casos de uso, reglas de dominio, sesiones, autorización, moderación y comparación." "TypeScript / REST API"
            datos = container "Persistencia" "Almacena catálogo, presentaciones, establecimientos, reportes, usuarios y estados." "Motor por decidir — ADR-003"
        }

        consumidor -> web "Consulta catálogo y precios"
        reportante -> web "Registra precios observados"
        comercio -> web "Gestiona perfil y precios oficiales (Corte 3)"
        moderador -> web "Gestiona casos de moderación"
        web -> api "Consume la API versionada" "HTTPS / JSON"
        api -> datos "Lee y escribe información del dominio" "Tecnología por decidir"
    }

    views {
        systemContext valora {
            include *
            autoLayout
        }

        container valora {
            include *
            autoLayout
        }
    }
}
