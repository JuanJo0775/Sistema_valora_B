# Contribuir al backend

## Flujo de trabajo

1. Revisa la épica correspondiente y los requisitos/decisiones enlazados.
2. Crea una rama corta desde `dev` actualizado: `feat/<tema>`, `fix/<tema>`, `chore/<tema>`, `docs/<tema>`, `test/<tema>` o `refactor/<tema>`. Nunca se trabaja ni se hace push directo sobre `dev` ni sobre `main`.
3. Implementa una unidad vertical pequeña dentro del monolito modular.
4. Añade o actualiza pruebas según el nivel aplicable.
5. Abre un pull request hacia `dev` (nunca hacia `main`) con `Closes #N` de la issue.
6. Quien abre el pull request puede mezclarlo cuando **todas** las verificaciones de la CI (`Calidad` y `Pruebas`) estén en verde. La revisión de otro integrante es bienvenida pero opcional; si alguien pide cambios, se atienden antes de mezclar. La rama debe estar al día con `dev`.
7. Mezcla con **"Create a merge commit"** o "Rebase and merge". **Nunca "Squash and merge"**: borra los commits rojo → verde → refactor del historial.
8. Borra la rama después de mezclar.

`main` solo recibe pull requests desde `dev` al cerrar un hito o una entrega, y se marca con una etiqueta de versión (`v0.1.0`, `v0.2.0`…).

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
- [ ] CI en verde (`Calidad` y `Pruebas`); revisión de otro integrante opcional.
- [ ] No se declara una prueba o despliegue sin evidencia.
