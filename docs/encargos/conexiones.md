# Encargo: pestaña Conexiones (antes "Programas")

Responde en español. No hagas commit. El árbol tiene cambios sin commit de trabajo anterior (incluida la corrección de ventanas en `window.ts`, `tray.ts`, `index.ts`, `settings-window.ts` y el helper): no los reviertas.

## Objetivo

Hoy la sección 4 de Ajustes ("Programas", en `src/renderer/settings-view.tsx`) solo muestra un comando para copiar y un botón "Abrir Terminal". La sustituimos por **Conexiones**: una tarjeta por servicio con su estado, la cuenta, el plan, la versión y los modelos. Se inicia sesión **desde J7**, sin Terminal. El diseño aprobado está más abajo.

## Reglas que no se negocian

1. **Independiente de T3.** No leas nada de `~/.t3` ni de ninguna otra app. Toda la información sale de los programas oficiales (`claude`, `codex`, `agy`, `opencode`) resueltos con `resolveBinary` (`src/main/providers/runtime.ts`).
2. **Nunca ejecutes de verdad login ni logout contra las cuentas del usuario** mientras desarrollas o pruebas. En este equipo hay sesiones reales de Claude y Codex: si cierras sesión o el login falla a mitad, se rompe J7. Prueba solo con binarios falsos (scripts en `tests/fixtures/`) o con mocks. Las comprobaciones reales las hace el revisor.
3. Nunca escribas en el log, en la interfaz ni en los tests tokens, `access_token`, `refresh_token`, `id_token` completos ni claves.
4. **Misma sesión que el programa oficial.** Los comandos de estado, login y logout se ejecutan con el entorno real del usuario (`HOME` real, sin `CODEX_HOME` ni el directorio privado de `privateHome`). Solo así la sesión queda compartida con la CLI. Claude guarda la credencial en el llavero, y Codex en `~/.codex/auth.json`, que `CodexProvider.connect()` enlaza a su carpeta privada con `linkExisting`. Por eso Codex inicia sesión con la CLI `codex login` y no con `account/login/start` del app-server privado: escribiría en la carpeta privada y rompería el enlace.
5. Hex sigue funcionando igual. Solo cambia de sitio (sección "Voz", al final de la pestaña).

## Datos por servicio (main)

Crea `src/main/connections.ts` con `readConnection(id)` y `readConnections()`. Cada conexión devuelve:

```ts
type Connection = {
  id: 'claude'|'codex'|'gemini'|'opencode';
  installed: boolean;
  version?: string;          // salida de `<bin> --version`, recortada (p. ej. "2.1.309", "0.167.0", "1.5.6")
  state: 'ready'|'not_installed'|'not_authenticated'|'signing_in'|'error';
  account?: { email?: string; plan?: string };
  detail?: string;           // mensaje de error legible
  login?: { url?: string; needsCode?: boolean }; // solo mientras state==='signing_in'
  modelCount: number;        // modelos de ese proveedor en chat.catalog.snapshot()
  enabled: boolean;          // !settings.disabledProviders.includes(id)
};
```

Cómo se obtiene cada dato. Usa `execFile` con un timeout de 10 s; un fallo da `state:'error'` con `detail`.
- **Claude**: `claude auth status --json` → `loggedIn`, `email` y `subscriptionType`. Plan: `pro`→"Claude Pro", `max`→"Claude Max", `team`→"Claude Team", `enterprise`→"Claude Enterprise". Si `authMethod` es de consola o API → "Clave de API". Cualquier otro valor → capitalizado.
- **Codex**: sesión con `codex login status` (exit 0 y texto "Logged in" = con sesión). Para email y plan, decodifica **solo el payload** del `id_token` de `~/.codex/auth.json`: claims `email` y `["https://api.openai.com/auth"].chatgpt_plan_type`. Plan: `plus`→"ChatGPT Plus", `pro`→"ChatGPT Pro", `free`→"ChatGPT Free"; `team`, `business`, `enterprise` y `edu` → "ChatGPT " + valor capitalizado. Si `auth_mode` es apiKey → "Clave de API". No guardes ni devuelvas nada más del archivo.
- **Antigravity (`gemini`)**: el estado sale de `GeminiProvider.getStatus()`, como ahora. Email y plan solo si `agy acp` los entrega en `initialize` o en la sesión. Si no, sin `account`. No leas el llavero.
- **OpenCode**: `opencode auth list`. Si hay alguna credencial, `ready`. Sin email ni plan.
- Después de cualquier login o logout, llama `chat.catalog.refresh(true)` para que los modelos y el estado se actualicen.

## Inicio de sesión desde J7

`src/main/connections.ts` exporta además `startLogin(id)`, `cancelLogin(id)`, `submitCode(id, code)` y `logout(id)`. Solo puede haber un login activo por servicio.

- **Claude**: `spawn(claudeBin, ['auth','login','--claudeai'])` con stdin en pipe. El programa abre solo el navegador (callback a localhost). Lee stdout y stderr. Guarda en `login.url` la primera URL `https://` que aparezca (para "Abrir el enlace otra vez"). Si aparece "Paste code here", marca `login.needsCode=true`. `submitCode` escribe el código + `\n` en stdin.
- **Codex**: `spawn(codexBin, ['login'])`. Guarda la URL igual (el programa abre el navegador con su servidor local).
- **Antigravity**: investiga sin tocar la cuenta. Arranca `agy acp`, envía `initialize` y registra (solo en tu informe) los `authMethods` que devuelve. Si alguno es un login por navegador con Google, úsalo con `authenticate {methodId}` en un proceso `agy acp` aparte. Si no hay ninguno utilizable, el botón "Iniciar sesión" abre la Terminal con `agy`: `osascript -e 'tell application "Terminal" to do script "agy"'`, más activar Terminal. La tarjeta muestra "Inicia sesión en la ventana de Terminal que se abrió; J7 lo detecta solo".
- **OpenCode**: igual que la variante con Terminal, con `opencode auth login`.
- Mientras dura el login: estado `signing_in`. Cada 2 s, `readConnection(id)`. Cuando pasa a `ready`, mata el proceso si sigue vivo, refresca el catálogo y avisa. Timeout de 5 min → mata el proceso, vuelve al estado leído y pone `detail` "No se completó el inicio de sesión. Inténtalo de nuevo.". Si el proceso sale con error, haz lo mismo con su último mensaje de stderr (recortado a 200 caracteres y sin URLs con tokens).
- `cancelLogin` mata el proceso con SIGTERM y deja el estado leído.
- **Logout**: Claude `claude auth logout`, Codex `codex logout`. Antigravity y OpenCode no tienen logout en J7: el botón no aparece.
- Al cerrar J7 (`will-quit`), mata los logins activos.

## IPC

En `src/main/settings-window.ts`, con el mismo `trusted(e)` que los demás handlers, y declarados en `src/shared/ipc.ts` y `src/preload/index.ts`:
- `connections:data` → `Connection[]`
- `connections:login(id)`, `connections:cancel(id)`, `connections:code(id, code)`, `connections:logout(id)`, `connections:open-login-url(id)`. Este último abre `login.url` con `shell.openExternal` solo si empieza por `https://`.
- Evento `connections:changed` (main → ventana de Ajustes) cada vez que cambia una conexión. El renderer vuelve a pedir `connections:data`.
- Valida `id` contra la lista fija y `code` (string ≤ 512, sin saltos de línea).
- `settings:open-url`: añade `opencode` a `downloadUrls` en `src/main/settings-programs.ts` con `https://opencode.ai/download`.

## Activar o desactivar un servicio

- `Settings` (`src/main/settings.ts`) gana `disabledProviders: ProviderId[]` (por defecto `[]`; valida al cargar y al guardar en `settings:save`, solo ids conocidos).
- Los modelos de un proveedor desactivado no aparecen en el selector de la barra ni en comparar, ni en la sección Modelos. Haz el filtro en un único sitio, el snapshot del catálogo o un helper compartido, y úsalo en todas partes. Si el modelo actual de la barra queda desactivado, se usa el primer modelo disponible, con la misma lógica que ya existe cuando un modelo desaparece.
- No se puede desactivar el último servicio con sesión: el interruptor queda deshabilitado con un `title` que lo explica.

## Interfaz (renderer)

- Extrae la sección a `src/renderer/components/Connections.tsx`. `settings-view.tsx` solo la monta. Renombra la sección "Programas" a "Conexiones" en `settingsStrings.sections`, y mantén el índice 4 y `?section=programs`, porque Primeros pasos abre esa sección.
- Todos los textos van en `src/renderer/strings.ts` (en `settingsStrings` o en un `connectionStrings` nuevo). Ningún texto suelto en el componente.
- Estilos en `src/renderer/style.css`, con las variables de tema que ya usa Ajustes. Funciona en claro y en oscuro.
- Estructura, de arriba abajo:
  1. Párrafo: "Conecta al menos una cuenta. J7 usa la misma sesión que el programa oficial de cada servicio." En modo de prueba (mocks) se mantiene `mockProgramsIntro`.
  2. Encabezado pequeño "Modelos de IA". Debajo, una tarjeta por servicio en este orden: Claude, ChatGPT (Codex), Gemini (Antigravity), OpenCode (solo si está instalado, como ahora).
  3. Encabezado "Voz" y la tarjeta de Hex, con el mismo contenido y los mismos botones que hoy.
  4. Botón "Volver a comprobar" (el `refresh` actual).
- Tarjeta:
  - Cabecera: `ProviderIcon` a 34 px; nombre del servicio ("Claude", "ChatGPT", "Gemini", "OpenCode") seguido, en gris, del programa y la versión ("Claude Code 2.1.309", "Codex 0.167.0", "Antigravity 1.5.6"); debajo, en gris, "Modelos de Anthropic" / "Modelos de OpenAI" / "Modelos de Google" / "Modelos gratis de Zen". A la derecha, la insignia de estado y el interruptor `role="switch"` de activado.
  - Insignias: `ready` "Conectado" (verde), `not_authenticated` "Sin sesión" (ámbar), `signing_in` "Esperando al navegador…" (azul; "Esperando a la Terminal…" en la variante con Terminal), `not_installed` "Sin instalar" (gris), `error` "Error" (rojo).
  - `ready`: línea con "Cuenta <email>", "Plan <plan>" y "Modelos <n>" (omite lo que falte). Botones: "Ver modelos" (despliega dentro de la tarjeta la lista de nombres de modelo de ese proveedor) y "Cerrar sesión" (solo Claude y Codex). Antes de cerrar sesión, `confirm()` con "¿Cerrar la sesión de <servicio> también en <programa>? Afecta a todas las apps que lo usan.".
  - `not_authenticated`: botón principal "Iniciar sesión", más el texto `detail` si existe.
  - `signing_in`: texto "Se abrió tu navegador para iniciar sesión. Vuelve aquí al terminar; J7 lo detecta solo.", botones "Abrir el enlace otra vez" (si hay `login.url`) y "Cancelar". Si `needsCode`, un campo "Código" con botón "Enviar".
  - `not_installed`: botón principal **"Descargar"** (abre la página oficial con `settingsOpenUrl(id)`), más un `<details>` "Instalar desde la Terminal" con el comando de `settingsPrograms[id].installCommand` y el botón "Copiar". OpenCode también tiene enlace de descarga. Hex mantiene su "Descargar".
  - `error`: `detail` y botón "Volver a comprobar".
  - **Enlace de descarga siempre a mano**: en todas las tarjetas, aunque estén conectadas, un enlace discreto "Sitio oficial" al final de la tarjeta que abre la misma URL. Así cualquier usuario sabe de dónde se descarga cada app.
- Elimina el botón "Abrir Terminal" y el texto `loginHelp`. Deja de usarse `settings:open-terminal`: borra el handler y su declaración si nada más lo usa.
- Accesibilidad: cada tarjeta es un `<section aria-labelledby>`, los botones tienen nombre accesible, y la insignia de estado lleva el texto (no solo color).

## Docs

- En `docs/funcionalidades.md`, sustituye los códigos de la sección Programas por los de Conexiones: estado y cuenta, login sin Terminal, cancelar, código, logout con confirmación, activar o desactivar, descarga y sitio oficial, Hex en Voz. Usa el formato y la numeración de ese archivo.
- Actualiza las menciones a "Programas" en `README.md` y en `docs/` que expliquen cómo conectar una cuenta.

## Pruebas

- Unitarias (vitest) para `connections.ts`, con binarios falsos en `tests/fixtures/` que impriman salidas como las reales:
  - lectura de estado y plan (Claude con `pro`/`max`; Codex con un `auth.json` de prueba en un `HOME` temporal y un JWT inventado);
  - login que imprime una URL y luego pasa a `ready`;
  - login que pide código;
  - timeout (usa temporizadores falsos);
  - cancelación;
  - validación de IPC;
  - filtro de `disabledProviders`;
  - bloqueo de desactivar el último servicio con sesión.
- Actualiza los tests existentes que dependan del texto "Programas" o del botón de Terminal (`tests/setup.test.ts`, `tests/unit/stage6.test.ts`, e2e si aplica).
- `npm run typecheck` y `npm test` deben pasar.

## Informe final

Archivos cambiados, `authMethods` que devolvió `agy acp` y la variante de login que elegiste para Antigravity, resultados de typecheck y tests, y cualquier decisión que no estuviera escrita aquí.
