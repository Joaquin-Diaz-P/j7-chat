# Colaborar con J7 Chat

Gracias por querer ayudar. Esta guía explica cómo está armado el proyecto y cómo probar un cambio antes de mandarlo.

## Preparar el entorno

Necesitas un Mac con Apple Silicon, macOS 14 o más nuevo, Node 24+ y las herramientas de línea de comandos de Xcode.

```sh
npm ci
npm run dev
```

`npm run dev` compila el ayudante nativo, genera los íconos y abre J7 en modo desarrollo. Para no mezclar pruebas con tus chats reales, usa una carpeta de datos aparte y proveedores simulados:

```sh
J7_DATA_DIR=/tmp/j7-dev J7_MOCK=1 npm run dev
```

- `J7_DATA_DIR`: carpeta de datos (chats, ajustes, adjuntos). Por defecto es `~/Library/Application Support/J7 Chat`.
- `J7_MOCK=1`: los modelos responden con texto de prueba y no gastan tu cuenta.

## Cómo está organizado

| Carpeta | Qué contiene |
| --- | --- |
| `src/main` | Proceso principal de Electron: ventanas, atajos, base de datos, adjuntos y conexión con los programas |
| `src/main/providers` | Un archivo por programa: `claude.ts` (Claude Agent SDK), `codex.ts` (app-server de Codex), `opencode.ts` |
| `src/main/capture`, `src/main/voice` | Captura de pantalla y dictado con Hex |
| `src/preload` | Puente seguro entre la ventana y el proceso principal (`window.j7`) |
| `src/renderer` | La interfaz en React: barra, selector de modelos y ajustes |
| `src/shared` | Tipos y lógica que usan los dos lados |
| `native/j7-helper` | Ayudante en Swift: captura con ScreenCaptureKit y escucha de teclas para la voz |
| `docs` | Especificación (`funcionalidades.md`), ideas pendientes y notas de diseño |

Los textos de la interfaz están en español, en `src/renderer/strings.ts`.

## Antes de mandar un cambio

```sh
npm run typecheck
npm test
npm run test:e2e   # recorrido completo de la app con Playwright y proveedores simulados
```

Si tocas la captura, la voz o el empaquetado, prueba también la app compilada con `npm run dist`, porque algunas cosas solo fallan fuera del modo desarrollo.

## Pull requests

- Un cambio por pull request, con una descripción corta de qué cambia y cómo lo probaste.
- Sigue el estilo del código que rodea tu cambio.
- Si agregas o cambias una funcionalidad, actualiza `docs/funcionalidades.md`.
- No subas datos personales, capturas reales ni claves.

Para ideas grandes, abre primero un issue y lo conversamos. Hay ideas pendientes en [docs/ideas-futuras.md](docs/ideas-futuras.md).
