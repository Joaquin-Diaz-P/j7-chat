# Encargo: etapa 6, ajustes, empaquetado y cierre

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Antes de empezar, lee `docs/especificacion.md`, `docs/funcionalidades.md` (secciones A, J, K y M), `docs/plan.md` y los reportes de las etapas anteriores.

## Objetivo

La ventana de ajustes completa, el primer arranque, el arranque al iniciar sesión y la app empaquetada (`.app` y `.dmg`) funcionando fuera de la terminal.

## Códigos que implementas

- **App:** A4, A5.
- **Ventana:** de B10, `⌘ ,`.
- **Ajustes:** J1, J2, J3, J4, J5, J6, J7.
- **Empaquetado:** K1, K2, K3.
- **Calidad:** M4 completo.

## Enfoque técnico

- **Ventana de ajustes (`src/main/settings-window.ts`):** un `BrowserWindow` normal de 720 × 560, con el título "Ajustes de J7 Chat". Usa el mismo bundle del renderer, con la ruta `#/settings`. No se esconde al perder el foco, y esconder la barra no la afecta.

- **Grabador de atajos (J3):**
  - **Combinaciones:** se arman a partir de `KeyboardEvent.code` y de las teclas modificadoras, y se convierten al formato de acelerador de Electron. Pruébalo con el teclado en español.
  - **Tecla de voz:** se elige una tecla modificadora con su lado, a partir de `event.code` (`AltRight`, `MetaLeft`, etc.).
  - **Al guardar:**
    1. El proceso principal intenta registrar el atajo nuevo.
    2. Si falla, muestra el error y el atajo anterior sigue activo.
    3. Si funciona, quita el anterior.
  - Muestra el choque con Hex (H5).

- **Programas (J6):**
  - El estado viene del registro de la etapa 2, más el estado de Hex.
  - Los comandos de instalación e inicio de sesión salen de `docs/etapa-0-resultados.md`. Cada uno tiene un botón para copiarlo.

- **Permisos (J7):** con el comando `permissions` del ayudante.

- **Arranque al iniciar sesión (A4):** `app.setLoginItemSettings({ openAtLogin })`. Solo se activa la primera vez que se abre la app.

- **Primer arranque (A5):** un flag `firstRunDone` en `settings.json`.

- **Empaquetado (K1):**
  - `electron-builder.yml`, con el `appId`, el nombre, la arquitectura arm64, `identity: null`, `LSUIElement` y el texto de Grabación de pantalla en `extendInfo`.
  - El ayudante va en `extraResources`.
  - El `.icns` se genera con un script: SVG → iconset → `iconutil -c icns`.

- **Crítico:** la app empaquetada se abre desde Finder sin el `PATH` de la shell. Comprueba que encuentra `claude`, `codex`, `gemini`, `opencode`, `hex` y el ayudante. Prueba la app de `release/` abriéndola con `open`, no desde la terminal de desarrollo.

- **README (K2):** cómo instalarla, abrirla la primera vez, dar los permisos, actualizarla y desarrollar.

- **Avisos de terceros (K3):** revisa que `THIRD_PARTY_NOTICES.md` esté completo.

## Tests

- **Unitarios:**
  - Conversión de teclas a aceleradores, incluidos casos con teclado en español.
  - Validación de los atajos: sin tecla modificadora, repetidos entre sí y que no se pueden registrar.
  - Primer arranque.
- **De punta a punta, con el `mock`:**
  - Ventana de ajustes: cada sección.
  - Cambiar el atajo y que funcione.
  - Que las instrucciones personales lleguen al `mock` con `/echo-context`.
  - Que el tema cambie en vivo.
- **M4 completo:** `npm test` y `npm run test:e2e` pasan enteros. El flujo principal de M4 queda cubierto.

## Comprobación manual

- Instalar desde el `.dmg`.
- Abrir con clic derecho y "Abrir".
- Conceder los permisos.
- Un turno con cada programa.
- Captura y voz.
- Historial.
- Cerrar sesión, volver a entrar y comprobar que J7 arrancó (A4).

Deja la lista de pasos para que el usuario la repita.

## Reporte final

Con el formato de la regla 11 del plan, más una lista de lo pendiente o recomendable para después, que Claude va a pasar a `docs/ideas-futuras.md`.
