# Contribuir al backend

## Flujo de trabajo

1. Revisa la épica correspondiente y los requisitos/decisiones enlazados.
2. Crea una rama corta desde `main`: `feat/<tema>`, `fix/<tema>`, `chore/<tema>`, `docs/<tema>`, `test/<tema>` o `refactor/<tema>`. Nunca se trabaja sobre `main`.
3. Implementa una unidad vertical pequeña dentro del monolito modular.
4. Añade o actualiza pruebas según el nivel aplicable.
5. Abre un Pull Request y solicita revisión de otro integrante.
6. Fusiona a `main` solo cuando el CI esté en verde (tipos, lint, pruebas con cobertura y reglas de dependencia). Quien hizo el cambio no aprueba su propio pull request.
7. Borra la rama después de fusionar.

Antes de abrir el pull request corre en local `pnpm typecheck`, `pnpm lint`, `pnpm test:cov` y `pnpm depcheck`. La descripción del pull request va en español: qué cambia y por qué, RF/EC/ADR relacionados y cómo se probó.

## Commits

Usar Conventional Commits con la descripción en español. Tipos: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`, `ci`, `build`. Un commit hace una sola cosa. En TDD, la prueba que falla (`test`), el código que la pasa (`feat` o `fix`) y la refactorización (`refactor`) van en commits separados:

- `test(pricing): rechazar un reporte repetido con la misma clave de idempotencia`
- `feat(pricing): registrar reporte con clave de idempotencia`
- `fix(comparison): conservar el orden neutral`
- `docs(api): actualizar el contrato OpenAPI`

No se agregan líneas `Co-Authored-By` ni marcas de herramientas en commits ni en pull requests.

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
