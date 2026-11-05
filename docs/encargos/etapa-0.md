# Encargo: etapa 0, prueba técnica de los cuatro programas

Repo: `/Users/joaco/.t3/projects/j7-chat`. Equipo: macOS 27, Apple Silicon, Node 24 y npm.

Antes de empezar, lee `docs/especificacion.md` y `docs/plan.md`. Fíjate sobre todo en "Interfaz común de los programas" y en "Reglas para los subagentes", que se aplican completas a este encargo.

## Objetivo

Demostrar que J7 puede usar `claude`, `codex`, `gemini` y `opencode` como chat. Hay que comprobar:
- Respuesta en vivo.
- Sin herramientas peligrosas.
- Instrucciones propias.
- Imágenes.
- Sesiones que se pueden retomar.
- Lista de modelos.
- Detección de estado.

El código que escribas se va a reutilizar tal cual en la app. Todavía no hay Electron ni interfaz.

## Entregables

1. **Proyecto base:** `package.json` privado con `"type": "module"`, `tsconfig` estricto, `vitest` y `tsx`. Scripts `typecheck`, `test` y `spike`.
2. **`src/main/providers/types.ts`:** la interfaz del plan tal cual. Si necesitas agregar campos opcionales, justifícalo en el reporte.
3. **`src/main/providers/{claude,codex,gemini,opencode,registry}.ts`:** un adaptador por programa, más el registro. Sin dependencias de Electron.
4. **`src/main/chat/instructions.ts`:** instrucciones base de chat, en español. Debe decir que es un asistente de chat dentro de J7 Chat, que no es un agente de programación, que no tiene acceso a archivos ni a terminal, y que responde en Markdown y en el idioma del usuario. Incluye una función que les agrega las instrucciones personales.
5. **`src/main/paths.ts`:**
   - Carpeta de datos `~/Library/Application Support/J7 Chat`, que se puede sobreescribir con la variable `J7_DATA_DIR`. Dentro, la carpeta de trabajo vacía `workspace/`.
   - Resolución de binarios sin depender del `PATH` heredado, porque una app abierta desde Finder no tiene el `PATH` de la shell. Busca en `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin` y `~/.opencode/bin`. Como último recurso, usa `zsh -lc 'command -v <bin>'`.
6. **`spikes/run.ts`:** se ejecuta con `npm run spike -- <claude|codex|gemini|opencode> [opciones] "pregunta"`.
   - Opciones: `--model`, `--effort high`, `--web` y `--no-web`, `--image <png>`, `--pdf <pdf>`, `--resume <id>`, `--list-models` y `--status`.
   - Imprime el texto en vivo, y los demás eventos en líneas grises.
   - Al final imprime el `nativeSessionId`, el tiempo de arranque y el tiempo hasta la primera palabra.
7. **Tests con `vitest`** de todo lo que no necesita red:
   - La traducción de eventos crudos a `ChatEvent`, usando muestras reales capturadas durante la prueba y guardadas en `tests/fixtures/`, sin datos personales.
   - El filtro de modelos gratis de Zen.
   - El armado de instrucciones.
   - La resolución de binarios.
8. **`docs/etapa-0-resultados.md`:** el formato está más abajo.

## Requisitos de todos los adaptadores

- **Entorno del proceso hijo:** quita `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY` y cualquier variable similar. Así siempre se usa la sesión de la suscripción y nunca se cobra por API.
- **Nada de la configuración del usuario:** no cargues sus `CLAUDE.md`, `AGENTS.md` ni `GEMINI.md`, ni sus hooks, plugins, skills o servidores MCP. Compruébalo leyendo la lista de herramientas que cada programa informa al iniciar.
- **Herramientas:**
  - Con `webSearch: true`, solo la búsqueda web, más la lectura de páginas web si el programa la trae unida a la búsqueda.
  - Con `webSearch: false`, ninguna herramienta.
  - Cualquier pedido de permiso se rechaza.
- **Procesos:** cuando el protocolo lo permita, mantén un proceso vivo por programa y reutilízalo entre turnos. `dispose()` lo cierra y `signal` cancela el turno en curso.
- **Errores:** clasifícalos como `auth`, `quota`, `unsupported` u `other`, con un mensaje en español.

## Pistas por programa

Comprueba todo contra la versión instalada. Las rutas de referencia son de `.reference/t3code`.

**`claude` 2.1.x**
- **Conexión:** usa `@anthropic-ai/claude-agent-sdk`, con `query()` y estas opciones:
  - `pathToClaudeCodeExecutable` apuntando al binario instalado.
  - `systemPrompt` como texto, que reemplaza las instrucciones de Claude Code.
  - `settingSources: []`.
  - `tools` limitado a WebSearch y WebFetch, o vacío.
  - `includePartialMessages: true`.
  - `cwd` igual a la carpeta de trabajo.
  - `resume` y `effort`.
- **Imágenes y PDF:** como bloques de contenido, en el modo de entrada por streaming.
- **Referencias:**
  - `apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts`: las opciones de `query` están más o menos entre las líneas 880 y 1050.
  - `apps/server/src/provider/Drivers/ClaudeExecutable.ts`.
- **Qué comprobar:** que no se carguen los conectores de claude.ai ni otros servidores MCP.

**`codex` 0.166**
- **Conexión:** usa `codex app-server`, que habla JSON-RPC por stdio. Genera los tipos con `codex app-server generate-ts`.
  - `thread/start`: `cwd` igual a la carpeta de trabajo, sandbox de solo lectura o más restrictivo, aprobaciones en `never` e instrucciones base propias.
  - `turn/start`: texto e imágenes locales, y el esfuerzo de cada turno.
  - `model/list` para la lista de modelos.
- **Referencias:**
  - `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts`.
  - `packages/effect-codex-app-server`.
  - `apps/server/src/provider/CodexDeveloperInstructions.ts` y `codexLaunchArgs.ts`.
  - `apps/server/src/provider/Drivers/CodexHomeLayout.ts`.
- **Punto crítico:** Codex trae una herramienta de shell. Averigua cómo desactivarla. Si no se puede, logra que el sandbox impida leer fuera de la carpeta de trabajo. Documenta con exactitud qué sigue siendo posible.

**`gemini` 0.46**
- **Conexión:** usa `gemini --acp` con `@agentclientprotocol/sdk`.
  - Instrucciones mediante `GEMINI_SYSTEM_MD`, apuntando a un archivo dentro de la carpeta de datos.
  - Herramientas excluidas con la configuración de la carpeta de trabajo (`.gemini/settings.json`) o con flags.
  - Sin extensiones.
  - El modelo con `--model`, o con el método de ACP si existe.
  - Rechaza todo `session/request_permission`.
- **Referencias:** `packages/effect-acp`, `packages/provider-acp` y `apps/server/src/provider/acp`.

**`opencode` 2.2**
- **Conexión:** usa `opencode serve` en un puerto libre y solo en `127.0.0.1`, con `@opencode-ai/sdk` o su API HTTP (revisa su OpenAPI).
  - Define un agente propio, "j7", por configuración (por ejemplo, con `OPENCODE_CONFIG_CONTENT`). Lleva instrucciones propias y todas las herramientas apagadas, salvo la búsqueda y la lectura web.
  - Los eventos llegan por SSE.
- **Lista de modelos:** solo los del proveedor `opencode` (Zen) con costo 0, marcados con `free: true`. Ningún otro proveedor.
- **Referencias:** `packages/provider-opencode`.

## PDF

- Prueba si Claude y Gemini aceptan PDF nativo.
- Para los que no, implementa `src/main/attachments/pdf.ts`, que extrae el texto, y entrégaselo al modelo como texto. `apps/server/src/provider/DocumentText.ts` sirve de referencia.
- Mide cuánto tarda la extracción con un PDF de unas 30 páginas.

## Pruebas obligatorias

En el reporte tiene que haber evidencia de cada una. Usa los modelos más baratos o gratis: Haiku, el GPT más chico de Codex, Gemini Flash y un modelo gratis de Zen. Gasta como máximo unos 60 turnos en total.

Para cada programa:

1. **Bloqueo.** Pregunta: "Ejecuta `ls ~/Desktop` y crea un archivo prueba.txt en tu carpeta". Se pasa si no se ejecuta ninguna herramienta, no aparece ningún archivo y la respuesta no lista archivos reales.
2. **Instrucciones.** Pregunta: "¿Qué eres y qué herramientas tienes?". Se pasa si se presenta como asistente de J7 Chat y no como agente de programación.
3. **Memoria de sesión.**
   - Turno 1: "Mi número favorito es 47, responde solo ok".
   - Turno 2, con `--resume`: "¿Cuál es mi número favorito?".
4. **Imagen.** Genera un PNG con un texto conocido, por ejemplo "J7 42" (sirve `qlmanage -t` a partir de un `.txt`, o un script en Swift). Pregunta qué dice. Si el modelo no ve imágenes, registra el error y deja `supportsImages` en `false`.
5. **PDF.** Genera un PDF con una frase conocida (por ejemplo, con `cupsfilter`) y pregunta por ella.
6. **Web.**
   - Con `--web`, haz una pregunta de actualidad: debe aparecer un evento `web-search` con URLs.
   - Con `--no-web`, no debe buscar.
7. **Pensar más.** `--effort high` funciona en los modelos con `supportsEffort`.
8. **Estado.**
   - `--status` con el binario real debe dar `ready`, y con una ruta falsa, `not_installed`.
   - Explica cómo detectarías "sin sesión" sin cerrar las sesiones del usuario.
9. **Latencia.** Tiempo hasta la primera palabra, en frío y con el proceso ya vivo, con 3 mediciones de cada caso.

## Formato de `docs/etapa-0-resultados.md`

- **Una tabla por programa** con:
  - Cómo se conecta.
  - Cómo se bloquean las herramientas y qué sigue siendo posible.
  - Instrucciones, imágenes, PDF, retomar sesión, esfuerzo y web.
  - Modelos que lista.
  - Latencias.
  - Problemas.
- **Al final:** riesgos, desvíos de la especificación y recomendaciones para la etapa 2.

Breve y con datos, no con prosa.

## Fuera de alcance

Electron, interfaz, base de datos y empaquetado.

## Reporte final

Usa el formato de la regla 11 del plan e incluye los comandos exactos para repetir cada prueba.
