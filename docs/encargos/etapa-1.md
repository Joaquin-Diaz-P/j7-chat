# Encargo: etapa 1, la barra con Claude

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Antes de empezar, lee `docs/especificacion.md`, `docs/funcionalidades.md`, `docs/plan.md` (sobre todo "Reglas para los subagentes") y `docs/etapa-0-resultados.md`.

## Objetivo

La app de Electron en la barra de menús, con la barra flotante completa y chat en vivo con un modelo de Claude. Cada respuesta se muestra con Markdown, código y fórmulas, y la estética de T3 Code.

Todavía no hay selector de modelos, adjuntos, historial ni ventana de ajustes.

## Códigos que implementas

- **App:** A1, A2, A3, A6.
- **Ventana:** B1, B2, B3, B4, B5, B6, B7, B9, B11, B12 y, de B10, solo `⌘ N`, `⌘ .` y `⌘ ⇧ C`.
- **Barra de entrada:** C1, C2, C3, C4. En C3, los botones que todavía no funcionan (📎, ✂︎, 🌐, "Pensar más" y el selector) se muestran desactivados, con el tooltip "Próximamente".
- **Respuestas:** E1, E2, E3, E5, E6, E7, E11. Para los errores, por ahora basta un bloque simple con el mensaje; E4 completo es de la etapa 2.
- **Estética:** L1, L2, L3, L4.
- **Calidad:** M1, M2, M3, M5 y la base de M4 (ver "Tests").

## Parte de

Los adaptadores, `paths.ts` y `instructions.ts` de la etapa 0. No los reescribas: si necesitas cambiarlos, haz el cambio mínimo y explícalo en el reporte.

## Enfoque técnico

- **Proyecto:** `electron-vite` con tres entradas (main, preload y renderer), React 19, Tailwind 4 con `@tailwindcss/vite`, `zustand` y `lucide-react`.
  - Scripts: `dev`, `build`, `typecheck`, `test` y `test:e2e`.
  - Conserva el script `spike` de la etapa 0.

- **Ventana (`src/main/window.ts`):**
  - Opciones del `BrowserWindow`:
    - `type: "panel"`, `frame: false`, `transparent: true`.
    - `vibrancy`: prueba `"popover"` y `"hud"`, y quédate con la que se vea mejor sobre fondos claros y oscuros. Documenta cuál elegiste.
    - `visualEffectState: "active"`, `roundedCorners: true`, `hasShadow: true`.
    - `resizable: false`, `fullscreenable: false`, `skipTaskbar: true`, `show: false`.
    - `alwaysOnTop` con nivel `"floating"`.
  - Llama a `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
  - **Tamaño:** el renderer mide la altura de su contenido con `ResizeObserver` y la envía por IPC (`window:setContentHeight`) a lo más una vez por cuadro. El proceso principal calcula los límites según B3 y B5 y aplica `setBounds` sin animación.
  - **Arrastre:** `-webkit-app-region: drag` en la franja superior y las zonas vacías, y `no-drag` en todo lo interactivo.
  - **Posición por pantalla (B4):** se guarda en `settings.json`, con `display.id` como clave.
  - **Esconder (B6):**
    - Con un flag `suppressHide`, que en esta etapa se usa en los tests y que en la etapa 3 usarán los diálogos y las capturas.
    - El foco tiene que volver a la app anterior. Prueba `app.hide()` y verifica que no esconda la ventana de ajustes futura. Documenta la solución que elegiste.
  - **Regla de los 5 minutos (B9):** el proceso principal guarda `lastHiddenAt` y, al mostrar la barra, avisa al renderer si debe continuar el chat o empezar uno nuevo. Usa un reloj inyectable para los tests.

- **Atajo (`src/main/shortcuts.ts`):** `globalShortcut` con el atajo guardado en `settings.json`, por defecto `Alt+J`.
  - Comprueba que funcione con la distribución de teclado en español, que es la del usuario.
  - Si no se puede registrar, regístralo en el log y avisa con una notificación.

- **Ícono de la barra de menús (A1):** genera `iconTemplate.png` y `iconTemplate@2x.png` a partir de `assets/icon.svg`, con un script (por ejemplo, `@resvg/resvg-js`), como imagen de plantilla monocroma.

- **Chat:**
  - Un `ChatService` mínimo en memoria, en `src/main/chat/`. Usa el adaptador de Claude con un modelo Sonnet, o el primer Claude disponible.
  - Si `J7_MOCK=1`, usa el proveedor `mock` (M5) en lugar de Claude.
  - Diseña el servicio pensando en que la etapa 2 lo va a generalizar a todos los modelos, pero no implementes el traspaso.

- **IPC (`src/shared/ipc.ts`):** un contrato tipado. El renderer recibe `chat:event` con `{chatId, messageId, event}`.

- **Respuestas en vivo (E1):**
  - Muestra el Markdown con `react-markdown`, `remark-gfm`, `remark-math` y `rehype-katex`, a lo más 30 veces por segundo.
  - Memoriza los bloques ya completos para no volver a colorearlos.
  - `shiki` se carga una sola vez, solo con los lenguajes comunes, y colorea de forma asíncrona. Mientras tanto, el código se muestra como texto plano.

- **Fórmulas (E7):** convierte `\(…\)` y `\[…\]` a `$…$` y `$$…$$` antes de `remark-math`, sin tocar los bloques de código.

- **Enlaces (E5):** `setWindowOpenHandler` y `will-navigate` los redirigen a `shell.openExternal`.

- **Seguridad (M2):**
  - `contextIsolation`, `sandbox` y `nodeIntegration: false`.
  - Una CSP en `index.html`: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'`.

- **Estética (L1):** copia las variables de `.reference/t3code/apps/web/src/index.css` que sirvan (colores, radios, sombras y fuentes) a `src/renderer/styles/theme.css`, y regístralo en `THIRD_PARTY_NOTICES.md`. Calibra la transparencia de los fondos según L2.

- **Registros (M3):** `src/main/logger.ts`, con rotación a los 5 MB y sin contenido de los mensajes.

## Tests

- **Unitarios:**
  - Cálculo de límites de la ventana (B3, B5).
  - Posición por pantalla (B4).
  - Regla de los 5 minutos (B9).
  - Conversión de fórmulas (E7).
  - Proveedor `mock`.
  - Validación de `settings.json`.
- **De punta a punta, con Playwright y Electron:** usa `J7_MOCK=1` y un `J7_DATA_DIR` temporal. Para mostrar y esconder la barra, expón un gancho de prueba que solo exista con `J7_TEST=1`. Recorre:
  - `/md` muestra una tabla, código coloreado y una fórmula.
  - `/think` muestra el razonamiento plegado.
  - `/slow` con ■ y con `⌘ .` deja el texto marcado "(detenido)".
  - `/err other` muestra el bloque de error.
  - `Esc` esconde la barra.
  - `⌘ N` deja la barra con la altura mínima.

## Comprobación manual

Haz cada "Se comprueba" de tus códigos con la app real (`npm run dev`) y deja la evidencia en el reporte. Para lo visual, incluye capturas guardadas en `docs/evidencia/etapa-1/`. Haz una sola prueba real con Claude: una pregunta corta, respondida en vivo.

## Fuera de alcance

Selector de modelos, otros programas, adjuntos, captura, voz, historial, ventana de ajustes y empaquetado.

## Reporte final

Con el formato de la regla 11 del plan.
