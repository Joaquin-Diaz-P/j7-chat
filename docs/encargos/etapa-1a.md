# Encargo: etapa 1a, ventana, atajo y chat básico

Repo: `/Users/joaco/.t3/projects/j7-chat`. Ya existen los adaptadores de la etapa 0 en `src/main/`, con sus tests.

Lee `docs/plan.md`, en especial las reglas para los subagentes, y en `docs/funcionalidades.md` solo las secciones de tus códigos.

## Objetivo

Que la app de Electron funcione en la barra de menús, con la barra flotante completa: aparece y se esconde, crece y se posiciona según las funcionalidades, y tiene un chat de texto plano en vivo con el proveedor `mock`.

El Markdown, la estética de T3 Code y Claude real son de la etapa 1b. Aquí la interfaz puede ser sencilla, pero tiene que ser correcta.

## Códigos

- **App:** A1, A2, A3, A6.
- **Ventana:** B1, B2, B3, B4, B5, B6, B7, B9, B11, B12, y de B10 solo `⌘ N` y `⌘ .`.
- **Barra de entrada:** C1, C2, C4.
- **Respuestas:** E3.
- **Calidad:** M2, M3, M5.

## Enfoque técnico

- **Proyecto:**
  - Agrega `electron-vite` (main, preload y renderer), Electron estable, React 19, Tailwind 4 con `@tailwindcss/vite` y `zustand`.
  - Scripts: `dev`, `build`, `typecheck` y `test`. Conserva `spike`.
  - El `tsconfig` debe cubrir el renderer (DOM y JSX) sin romper la configuración actual.

- **Ventana (`src/main/window.ts`):**
  - **Opciones:**
    - `type: "panel"`, `frame: false`, `transparent: true`.
    - `vibrancy: "popover"` y `visualEffectState: "active"`.
    - `roundedCorners`, `hasShadow`, `resizable: false`, `fullscreenable: false`, `skipTaskbar` y `show: false`.
    - `alwaysOnTop` en el nivel `"floating"`.
    - `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
  - **Tamaño (B3, B5):** el renderer mide su contenido con `ResizeObserver` y envía la altura por IPC (`window:setContentHeight`), a lo más una vez por cuadro. El proceso principal calcula los límites con una función pura y aplica `setBounds` sin animación.
  - **Arrastre:** `-webkit-app-region: drag` en la franja superior; `no-drag` en todo lo interactivo.
  - **Posición (B4):** se guarda en `settings.json`, con `display.id` como clave.
  - **Esconder (B6):** usa un flag `suppressHide` que la etapa 3 va a usar para los diálogos y las capturas. Al esconder, el foco tiene que volver a la app anterior: prueba `app.hide()` y documenta lo que elijas.
  - **Regla de los 5 minutos (B9):** usa un reloj inyectable. El proceso principal le avisa al renderer si continúa el chat o empieza uno nuevo.

- **Atajo (`src/main/shortcuts.ts`):**
  - `globalShortcut` con el atajo de `settings.json`, por defecto `Alt+J`. Tiene que funcionar con el teclado en español.
  - Si no se puede registrar, lo anota en el log y muestra una notificación.

- **Ícono (A1):** un script que genera `iconTemplate.png` e `iconTemplate@2x.png` monocromos a partir de `assets/icon.svg`.

- **Ajustes (`src/main/settings.ts`):** lee y escribe `{datos}/settings.json` con validación y valores por defecto. Los valores inválidos se reemplazan por los de defecto, sin que la app se caiga.

- **Chat:**
  - Un `ChatService` mínimo en memoria, en `src/main/chat/`, pensado para que la etapa 2 lo generalice.
  - En esta etapa usa solo el proveedor `mock` (`src/main/providers/mock.ts`, M5), que se activa con `J7_MOCK=1` y además es el proveedor por defecto mientras no haya otro conectado.
  - Agrega `"mock"` a `ProviderId`.

- **IPC (`src/shared/ipc.ts`):** un contrato tipado. El renderer recibe `chat:event` con `{chatId, messageId, event}`.

- **Interfaz:**
  - Barra de entrada según C1, C2 y C4.
  - Conversación con el texto plano de cada mensaje, en vivo.
  - ■ y `⌘ .` detienen la respuesta (E3), y `⌘ N` empieza un chat nuevo.

- **Seguridad (M2):**
  - `contextIsolation`, `sandbox` y `nodeIntegration: false`.
  - Una CSP en `index.html`: `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'`.
  - Los enlaces externos se abren con `shell.openExternal`.

- **Registros (M3):** `src/main/logger.ts`, que rota a los 5 MB y nunca guarda el contenido de los mensajes.

## Tests (vitest)

- Límites de la ventana (B3, B5).
- Posición por pantalla (B4).
- Regla de los 5 minutos (B9).
- `settings.ts` con valores válidos, inválidos y faltantes.
- Proveedor `mock`: cada comando de M5 y la cancelación.
- `ChatService`: enviar, recibir en vivo y detener.

## Al terminar

- `npm run typecheck` y `npm test` pasan.
- `npm run dev` abre la app sin errores en la consola.
- En el reporte, deja una lista corta de pasos para que Claude compruebe cada código con la app real.

Esta etapa no hace ningún turno real con los programas.

## Fuera de alcance

Markdown, colores de código, fórmulas, estética de T3 Code, Claude real, selector de modelos, adjuntos, historial, ajustes, captura y voz.
