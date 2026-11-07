# Encargo: primeros pasos (J6, J7, J8)

Objetivo: que alguien sin experiencia descargue J7 desde GitHub y llegue solo a tenerlo funcionando. Lee en `docs/funcionalidades.md` solo **J6, J7 y J8**: son la especificación exacta (textos incluidos). Sigue las reglas de `docs/plan.md` («Reglas para los subagentes»).

## Dónde está cada cosa hoy

- `src/renderer/settings-view.tsx`: la vista de ajustes. `section` es un índice sobre `settingsStrings.sections` (`4` = Programas, `5` = Permisos). Programas y Permisos están en las líneas que empiezan con `{section===4&&` y `{section===5&&`. Mantén el estilo compacto del archivo.
- `src/renderer/strings.ts`: `settingsStrings` y `settingsCommands`. Todo texto nuevo va aquí. Reemplaza `settingsCommands` por una estructura por programa con `label`, `purpose`, `downloadUrl`, `installCommand?`, `loginCommand?`.
- `src/main/settings-window.ts`: `openSettings()`, `settings:data` (junta catálogo, permisos del helper y estado de Hex) y `settings:permission` (abre `x-apple.systempreferences:…Privacy_ScreenCapture | Privacy_ListenEvent`).
- `src/preload/index.ts`: API `window.j7.*` de ajustes.
- `src/main/voice/hex.ts`: `Hex.installed()`, `status()` (JSON con `permissions.microphone` y `permissions.accessibility`; código de salida 3 = Hex cerrado), `start()`.
- `src/main/index.ts`: arranque. El bloque `if (!settings.value.firstRunDone)` marca el primer arranque; `chat.catalog.refresh()` comprueba los programas y `chat.catalog.snapshot().statuses` da `{claude, codex, opencode, gemini?}` con `state`.

## Qué hacer

1. **Programas (J6)** con los nombres, textos, URLs y comandos de J6. OpenCode solo si su estado no es `not_installed`. No toques los adaptadores en `src/main/providers/`.
2. **Abrir enlaces de forma segura:** nuevo IPC `settings:open-url` que recibe un **id de programa**, no una URL, y abre con `shell.openExternal` la `downloadUrl` de ese id desde una lista fija en el proceso principal. Ninguna otra URL se puede abrir.
3. **Abrir Terminal y Hex:** IPC `settings:open-terminal` (`shell.openPath('/System/Applications/Utilities/Terminal.app')`) y `settings:start-hex` (`new Hex().start()`).
4. **Permisos (J7):** amplía `settings:permission` para aceptar también `microphone` → `Privacy_Microphone` y `accessibility` → `Privacy_Accessibility`. En `settings:data` agrega `hex.permissions: {microphone:boolean, accessibility:boolean} | undefined` (undefined si Hex no está instalado o no responde) y `hex.running:boolean`. IPC `settings:relaunch` → `app.relaunch(); app.exit(0)`.
5. **Actualización sola:** la vista vuelve a cargar los datos (y llama a `settingsRefresh`) cuando la ventana recupera el foco (`window` `focus`).
6. **Primeros pasos (J8):** `openSettings(section?: 'programs' | 'permissions')`. Pasa la sección por el hash (`#/settings?section=programs`) y que la vista la use como sección inicial; si la ventana ya está abierta, envíale la sección por IPC. En `index.ts`, después de `chat.start()`, espera la primera `chat.catalog.refresh()` y decide con una **función pura** exportada, por ejemplo `setupSection({statuses, permissions, firstRun})` → `'programs' | 'permissions' | undefined`, en un archivo nuevo `src/main/setup.ts`. Lee `firstRun` **antes** de que el bloque existente ponga `firstRunDone:true`. Los permisos los pide el helper (`helper.request('permissions')`), igual que `settings:data`; reutiliza ese camino.
7. **Pruebas:** tests unitarios (vitest, en `tests/`) para `setupSection` (los casos de J8) y para que `settings:open-url` solo acepte ids conocidos (si es más simple, prueba la función que resuelve id → URL). No hace falta probar con CDP.

## Fuera de alcance

- No cambies README ni otros `docs/` (lo hace Claude).
- Ningún turno real con modelos.
- No subas la versión.

## Al terminar

`npm run typecheck`, `npm test` y `npm run build` tienen que pasar. Reporte según la regla 11 de `docs/plan.md`.
