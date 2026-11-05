# J7 Chat: plan de construcción

El qué está en [especificacion.md](especificacion.md); el detalle de cada funcionalidad, con su código y cómo se comprueba, en [funcionalidades.md](funcionalidades.md). Este documento cubre el cómo y el orden. El avance de cada código se lleva en [estado.md](estado.md).

## Forma de trabajo

1. **Encargo.** Cada etapa tiene un encargo en `docs/encargos/etapa-N.md` con los códigos que debe implementar, los archivos y el enfoque técnico.
2. **Construcción.** Un subagente de Codex con el modelo y el razonamiento de la tabla de etapas ejecuta el encargo. Escribe el código y los tests unitarios de la lógica, comprueba que `npm run dev` arranca sin errores y entrega un reporte.
3. **Revisión, a cargo de un subagente Claude Opus con razonamiento medio**, código por código:
   - Lee los cambios.
   - Corre `npm run typecheck` y `npm test`.
   - Prueba la app real siguiendo cada "Se comprueba", con el proveedor `mock`.
   - Entrega una tabla con cada código: ✅, ❌ (con la causa) o 🔍 (necesita una prueba física).
   - **Cómo probar la app:**
     - `npm run dev -- --remoteDebuggingPort 9333`, con un `J7_DATA_DIR` temporal.
     - `node scripts/verify/cdp.mjs '<comandos CDP>'` para escribir, apretar teclas y leer el DOM.
     - `scripts/verify/windows.swift <pid>` para leer los límites de la ventana.
     - `agent-desktop press alt+j` para el atajo global.
     - `agent-desktop` no puede leer ventanas tipo panel.
4. **El orquestador** (Claude, la sesión principal) solo lee ese reporte, actualiza `docs/estado.md` y decide.
5. **Correcciones.** Lo que falla se agrega al principio del encargo de la etapa siguiente, o, si bloquea, se manda en un encargo corto de correcciones.
6. **Cierre.** El orquestador hace un commit por etapa en la rama `desarrollo`.

**Para ahorrar cuota:**
- Los encargos son cortos y no piden volver a leer `.reference/t3code`; la referencia es `docs/etapa-0-resultados.md` y el código que ya existe.
- Las pruebas de la app real las hace Claude, no los subagentes.
- Hay un solo recorrido de punta a punta con Playwright, en la etapa 6.

## Tecnología

| Pieza | Elección |
|---|---|
| App de escritorio | Electron (versión estable actual), con proceso principal, preload y renderer |
| Interfaz | React 19, TypeScript estricto, Tailwind CSS 4 y `lucide-react` |
| Estado de la interfaz | `zustand` |
| Build | `electron-vite`; empaquetado con `electron-builder` (arm64, sin firma) |
| Respuestas | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex` y `shiki` |
| Base de datos | SQLite con `node:sqlite` si funciona en Electron con FTS5; si no, `better-sqlite3` |
| Ajustes | `{datos}/settings.json` |
| PDF | `unpdf` (etapa 0) |
| Ayudante nativo | Swift compilado con `swiftc` (Command Line Tools) |
| Tests | `vitest` para la lógica; un recorrido de Playwright con Electron en la etapa 6 |
| Paquetes | `npm` |

Sin Effect.

## Estructura

```
src/
  main/                   proceso principal (Node)
    index.ts              arranque, instancia única, ciclo de vida
    tray.ts               ícono y menú de la barra de menús
    window.ts             panel: tamaño, posición, vidrio, mostrar y esconder, regla de 5 minutos
    settings-window.ts    ventana de ajustes
    shortcuts.ts          atajos globales
    settings.ts           lectura, escritura y validación de settings.json
    ipc.ts                registro de los canales IPC
    logger.ts
    paths.ts              carpeta de datos y resolución de binarios (etapa 0)
    providers/            types, runtime, claude, codex, opencode, mock y registry
                          (gemini.ts existe, pero no se registra en la versión 1)
    chat/                 service, recap, instructions, store (interfaz), memory-store
    attachments/          ingreso, pdf, image, text
    db/                   sqlite-store, migraciones y búsqueda
    native/helper.ts      cliente del ayudante Swift
    voice/hex.ts          cliente de la línea de comandos de Hex
    capture/flows.ts      flujos "Captura y pregunta" y "Captura y voz"
    titles.ts             títulos automáticos
  preload/index.ts        API tipada para el renderer
  shared/                 contrato IPC y tipos compartidos
  renderer/               React: App, components/, store/, strings.ts, styles/
native/j7-helper/         ayudante en Swift: tecla mantenida, captura de pantalla completa y títulos
spikes/                   scripts de la etapa 0
tests/                    tests de vitest, fixtures/ y e2e/ (etapa 6)
docs/
```

## Interfaz común de los programas

Está en `src/main/providers/types.ts` desde la etapa 0. La etapa 1a le agrega `"mock"` a `ProviderId`. El traspaso entre modelos está en F1 a F6 de `funcionalidades.md`.

## Etapas, modelo y códigos

| Etapa | Qué se construye | Modelo · razonamiento | Códigos |
|---|---|---|---|
| **0** ✓ | Prueba técnica de los programas | Sol · alto | Adaptadores y `docs/etapa-0-resultados.md` |
| **1a** | Ventana, atajo y chat básico con `mock` | Sol · medio | A1, A2, A3, A6 · B1–B7, B9, B10 (`⌘ N`, `⌘ .`), B11, B12 · C1, C2, C4 · E3 · M2, M3, M5 |
| **1b** | Respuestas, estética y Claude real | Sol · medio | B10 (`⌘ ⇧ C`) · C3 · E1, E2, E5, E6, E7, E11 · L1–L4 · M1 |
| **2** | Todos los modelos y traspaso | Sol · alto | C5, C6 · D1–D7 · E4, E8, E9, E10 · F1–F7 |
| **3** | Adjuntos | Sol · medio | G1–G9 · E12 |
| **4** | Atajos de captura y voz | Sol · medio | H1–H7 |
| **5** | Historial | Sol · medio | I1–I9 · B8 · B10 (`⌘ B`, `⌘ F`) |
| **6** | Ajustes, empaquetado y cierre | Sol · medio | A4, A5 · B10 (`⌘ ,`) · J1–J7 · K1–K3 · M4 |

## Reglas para los subagentes

1. Lee `docs/funcionalidades.md` (solo las secciones de tus códigos) y el encargo de tu etapa. Lee `docs/especificacion.md` solo si el encargo te lo pide.
2. **Implementa todos los códigos de tu etapa, y solo esos.** Cada uno tiene que cumplir su "Se comprueba".
3. **Si algo no se puede cumplir, no lo reemplaces en silencio por otra cosa.** Explícalo en el reporte, con la razón y una alternativa propuesta.
4. No hagas commits ni push. No toques los archivos de `docs/`, salvo los que tu encargo te pida crear.
5. TypeScript estricto. Nombres de código en inglés; los textos de la interfaz, en español y en `src/renderer/strings.ts`. Comentarios solo donde aporten.
6. Dependencias mínimas y de proyectos conocidos. Antes de agregar una, revisa si ya hay otra que haga lo mismo.
7. Reutiliza el código existente; no lo reescribas. Si necesitas cambiarlo, haz el cambio mínimo y explícalo en el reporte.
8. **Cuida las cuotas del usuario:** usa el proveedor `mock` (M5). Haz como máximo los turnos reales que pida tu encargo, con Claude Haiku o GPT‑6‑Luna.
9. Nunca escribas secretos ni tokens en archivos ni en los registros.
10. `npm run typecheck` y `npm test` tienen que pasar completos, no solo los tests nuevos.
11. **Reporte final, breve:**
    - Una tabla con cada código: implementado (sí o no) y cómo se puede comprobar.
    - Archivos creados o cambiados.
    - Comandos ejecutados y su resultado.
    - Desvíos.
    - Problemas abiertos.
