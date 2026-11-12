# Encargo: la barra y Ajustes se abren juntas

Responde en español. No hagas commit. El árbol tiene cambios sin commit de trabajo anterior: no los reviertas ni toques archivos que este encargo no nombra (salvo pruebas nuevas en `tests/`).

## Síntoma

El usuario abre la barra (⌥Space) o los Ajustes (⌘, , engranaje o menú de la bandeja) y aparecen las dos ventanas.

## Causas (ya diagnosticadas)

1. `src/main/window.ts`, `Panel.hide()`: llama `app.hide()`. Eso oculta **todas** las ventanas de J7, también Ajustes. Al volver a mostrar la barra, macOS desoculta la app y Ajustes reaparece con ella.
2. `src/main/index.ts`: `app.on("activate", () => panel?.show())`. Un clic en el Dock con Ajustes abierto también abre la barra.
3. `showSettingsNotice` (`src/main/tray.ts`, usado por `src/main/ipc.ts` con ⌘, y `settings:open`): abre Ajustes y deja la barra flotando encima.

## Cambios exactos

### A. Helper nativo (`native/j7-helper/main.swift`)
- Al arrancar, registra un observador de `NSWorkspace.shared.notificationCenter` para `didActivateApplicationNotification`. Guarda la última `NSRunningApplication` activada cuyo `processIdentifier` **no** sea el del proceso padre (J7; usa `getppid()`) ni el propio helper.
- Nuevo comando `"activatePreviousApp"` en el `switch message["command"]` (junto a `"permissions"`): si hay app guardada y no terminó, llama `activate()` y responde `{"activated": true}`; si no, `{"activated": false}`. Sigue el formato de respuesta de los comandos existentes.
- Compila con `npm run build:helper`.

### B. `NativeHelper` (`src/main/native/helper.ts`)
- Si hace falta, expón el comando nuevo igual que `request('permissions')`. No cambies el protocolo.

### C. `Panel.hide()` (`src/main/window.ts`)
- En `show()`, antes de enfocar, guarda `this.previousWindow = BrowserWindow.getFocusedWindow()` si es otra ventana de J7 distinta de `this.window` (si no, `undefined`).
- En el temporizador de `hide()`, tras `this.window.hide()`:
  - Si no hay otra ventana de J7 visible (`BrowserWindow.getAllWindows()` sin destruir, `isVisible()`, distinta de la barra): `app.hide()` como ahora.
  - Si `previousWindow` sigue visible: `previousWindow.focus()` (el usuario venía de Ajustes).
  - Si no: pide `activatePreviousApp` al helper. Si falla o responde `false`, no hagas nada más (**nunca** `app.hide()` en este caso, eso reintroduce el bug).
- `Panel` no tiene el helper: pásale una función opcional `activatePreviousApp?: () => Promise<boolean>` por el constructor o un setter; créala en `setupSettings`/`index.ts` reutilizando la instancia de `NativeHelper` que ya existe en `src/main/settings-window.ts` (devuélvela junto a `permissions` en el objeto que retorna `setupSettings`). No crees un segundo proceso helper.

### D. `src/main/index.ts`
- `app.on("activate", (_event, hasVisibleWindows) => { if (!hasVisibleWindows) panel?.show(); })`.

### E. `showSettingsNotice` (`src/main/tray.ts`)
- Primero `openSettings()`, después, si la barra está visible y `settings.value.pinned` es falso, `panel.hide()`. Si está fijada, déjala. `Panel` ya expone `settings`; si no es público, añade un getter mínimo.

## Pruebas
- Unitarias en `tests/unit/` con vitest (mira `tests/unit/shortcut-hold.test.ts` para el estilo de mocks de Electron): `hide()` llama `app.hide()` solo sin otras ventanas visibles; enfoca `previousWindow` si existe; llama `activatePreviousApp` en el otro caso; `activate` no muestra la barra si hay ventanas visibles; `showSettingsNotice` oculta la barra solo si no está fijada.
- Corre `npm run typecheck` y `npm test`. Las dos deben pasar.

## Informe final
Lista de archivos cambiados, salida resumida de typecheck y tests, y cualquier punto donde tuviste que decidir algo no escrito aquí.
