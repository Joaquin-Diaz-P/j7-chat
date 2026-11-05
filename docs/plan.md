# J7 Chat: plan de construcción

El qué está en [especificacion.md](especificacion.md); el detalle de cada funcionalidad, con su código y cómo se comprueba, en [funcionalidades.md](funcionalidades.md). Este documento cubre el cómo y el orden. El avance de cada código se lleva en [estado.md](estado.md).

## Forma de trabajo

1. **Encargo.** Cada etapa tiene un encargo en `docs/encargos/etapa-N.md` con los códigos que debe implementar, los archivos y el enfoque técnico.
2. **Construcción.** Un subagente **GPT‑6.1 Sol (razonamiento alto)** ejecuta el encargo y entrega un reporte.
3. **Revisión de Claude**, código por código:
   - Lee los cambios y confirma que cada código está implementado.
   - Corre `npm run typecheck`, `npm test` y, desde la etapa 1, `npm run test:e2e`.
   - Prueba la app real siguiendo cada "Se comprueba" de los códigos de la etapa.
   - Anota el resultado en `docs/estado.md`.
4. **Correcciones.** Los fallos pequeños los corrige Claude. Si son grandes, se arma un encargo nuevo solo con los códigos que fallaron.
5. **Cierre.** Una etapa se cierra cuando todos sus códigos están en ✅. Recién entonces parte la siguiente.

Las etapas son secuenciales y trabajan sobre la misma copia del repo.

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
| PDF | Extracción de texto en el proceso principal (se define en la etapa 0) |
| Ayudante nativo | Swift compilado con `swiftc` (Command Line Tools) |
| Tests | `vitest` para la lógica y Playwright con Electron para las pruebas de punta a punta |
| Paquetes | `npm` |

Sin Effect: el código toma ideas de T3 Code, pero simplificadas.

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
    paths.ts              carpeta de datos y resolución de binarios
    providers/            types, claude, codex, gemini, opencode, mock y registry
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
native/j7-helper/         ayudante en Swift: tecla mantenida y captura de pantalla completa
spikes/                   scripts de la etapa 0
tests/                    unit/, e2e/, fixtures/
docs/
.reference/t3code/        copia parcial de T3 Code, solo lectura (ignorada por git)
```

## Interfaz común de los programas

Cada programa se adapta a la misma interfaz. Los adaptadores no dependen de Electron.

```ts
type ProviderId = "claude" | "codex" | "gemini" | "opencode" | "mock";

interface ProviderStatus {
  state: "ready" | "not_installed" | "not_authenticated" | "error";
  detail?: string;
}

interface ModelInfo {
  id: string;
  label: string;
  provider: ProviderId;
  supportsImages: boolean;
  supportsPdf: boolean;    // PDF nativo; si es false, J7 extrae el texto
  supportsEffort: boolean; // muestra el botón "Pensar más"
  free?: boolean;
}

interface Attachment {
  kind: "image" | "pdf" | "text";
  path: string;
  name: string;
  mime: string;
  extractedText?: string;
}

interface TurnInput {
  model: string;
  effort: "normal" | "high";
  webSearch: boolean;
  instructions: string;      // instrucciones de chat base + personales
  nativeSessionId?: string;  // si existe, se retoma esa sesión
  text: string;
  attachments: Attachment[];
  signal: AbortSignal;
}

type ChatEvent =
  | { type: "session"; nativeSessionId: string }
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "web-search"; query?: string; urls: string[] }
  | { type: "done" }
  | { type: "error"; kind: "auth" | "quota" | "unsupported" | "other"; message: string };

interface ChatProvider {
  id: ProviderId;
  getStatus(): Promise<ProviderStatus>;
  listModels(): Promise<ModelInfo[]>;
  runTurn(input: TurnInput): AsyncIterable<ChatEvent>;
  dispose(): Promise<void>;
}
```

El traspaso entre modelos está en F1 a F5 de `funcionalidades.md`.

## Etapas y códigos

| Etapa | Qué se construye | Códigos |
|---|---|---|
| **0** | Prueba técnica de los cuatro programas | Interfaz común, adaptadores y `docs/etapa-0-resultados.md` |
| **1** | La barra con Claude | A1, A2, A3, A6 · B1–B7, B9, B10 (`⌘ N`, `⌘ .`, `⌘ ⇧ C`), B11, B12 · C1–C4 · E1–E3, E5–E7, E11 · L1–L4 · M1–M3, M5 · base de M4 |
| **2** | Todos los modelos | C5, C6 · D1–D7 · E4, E8, E9, E10 · F1–F7 |
| **3** | Adjuntos | G1–G9 · E12 |
| **4** | Atajos de captura y voz | H1–H7 |
| **5** | Historial | I1–I9 · B8 · B10 (`⌘ B`, `⌘ F`) |
| **6** | Ajustes, empaquetado y cierre | A4, A5 · B10 (`⌘ ,`) · J1–J7 · K1–K3 · M4 completo |

## Reglas para los subagentes

1. Lee `docs/especificacion.md`, `docs/funcionalidades.md`, `docs/plan.md` y el encargo de tu etapa antes de empezar.
2. **Implementa todos los códigos de tu etapa, y solo esos.** Cada uno tiene que cumplir su "Se comprueba".
3. **Si algo no se puede cumplir, no lo reemplaces en silencio por otra cosa.** Explícalo en el reporte, con la razón y una alternativa propuesta.
4. No hagas commits ni push. No toques `docs/especificacion.md`, `docs/funcionalidades.md`, `docs/ideas-futuras.md` ni `docs/estado.md`.
5. TypeScript estricto, sin `any` implícitos. Nombres de código en inglés; los textos de la interfaz, en español y en `src/renderer/strings.ts`. Comentarios solo donde aporten.
6. Dependencias mínimas y de proyectos conocidos. Antes de agregar una dependencia, revisa si ya hay una que haga lo mismo.
7. `.reference/t3code` es solo de consulta (licencia MIT). Si copias código de ahí, regístralo en `THIRD_PARTY_NOTICES.md`.
8. **Cuida las cuotas del usuario:** para la interfaz usa el proveedor `mock` (M5); usa los programas reales solo en las pruebas que lo exigen, con preguntas cortas y los modelos más baratos o gratis.
9. Nunca escribas secretos ni tokens en archivos ni en los registros.
10. No rompas lo de etapas anteriores: `npm test` y `npm run test:e2e` tienen que pasar completos, no solo los tests nuevos.
11. **Reporte final:**
    - Una tabla con cada código de la etapa: implementado, cómo se comprobó y su resultado.
    - Archivos creados o cambiados.
    - Comandos ejecutados y su resultado.
    - Desvíos.
    - Problemas abiertos.
