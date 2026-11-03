# Contribuir al backend

## Flujo de trabajo

1. Revisa la épica correspondiente y los requisitos/decisiones enlazados.
2. Crea una rama corta desde `main`: `feat/<tema>`, `fix/<tema>`, `test/<tema>` o `docs/<tema>`.
3. Implementa una unidad vertical pequeña dentro del monolito modular.
4. Añade o actualiza pruebas según el nivel aplicable.
5. Abre un Pull Request y solicita revisión de otro integrante.
6. Fusiona a `main` solo cuando las comprobaciones estén satisfechas.

## Commits

Usar Conventional Commits en español o inglés, con descripción concreta:

- `feat(catalog): add product presentation rules`
- `test(pricing): cover idempotent report submission`
- `fix(comparison): preserve neutral ordering`
- `docs(api): update OpenAPI contract`

Cada integrante debe realizar commits con su propia cuenta. No compartir cuentas ni atribuir commits de otra persona.

## Reglas de arquitectura

- Mantener el monolito modular; no separar módulos en servicios independientes sin ADR aceptado.
- Cada módulo es dueño de sus reglas y datos.
- Evitar acceder a repositorios o tablas internas de otro módulo.
- Mantener la API REST y el contrato OpenAPI 3.x sincronizados.
- No incluir identidad ni ubicación personal del reportante en respuestas públicas.
- La comparación no puede ordenar por patrocinio, perfil comercial ni promociones.
- Los reportes se conservan como historial; un reporte sospechoso se marca y revisa, no se borra.
- No introducir Docker en el MVP.
- No convertir valores provisionales en constantes aprobadas.

## Definition of Done

- [ ] Requisito y criterio de aceptación identificados.
- [ ] Pruebas escritas y ejecutadas; TDD para reglas de negocio.
- [ ] Revisión de seguridad y privacidad cuando aplique.
- [ ] OpenAPI actualizado si cambia la API.
- [ ] ADR actualizado o creado si hay una decisión estructural.
- [ ] Revisión de otro integrante.
- [ ] No se declara una prueba o despliegue sin evidencia.
