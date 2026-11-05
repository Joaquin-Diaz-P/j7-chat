# Encargo: etapa 4, atajos de captura y voz

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Antes de empezar, lee `docs/especificacion.md`, `docs/funcionalidades.md` (sección H), `docs/plan.md` y los reportes de las etapas anteriores.

## Objetivo

Dos atajos nuevos:
- **"Captura y pregunta":** captura la pantalla completa donde está el mouse y abre J7 con la captura adjunta.
- **"Captura y voz":** mientras se mantiene la tecla, captura la pantalla completa, abre J7 y graba con Hex; al soltar, transcribe y envía.

El flujo de voz tiene que aguantar que Hex se demore o falle sin perder nunca el texto dictado. Eso es H7, y es tan importante como el resto.

## Códigos que implementas

H1, H2, H3, H4, H5, H6 y H7.

## Hechos comprobados

Esto se probó en el Mac del usuario el 4 de noviembre de 2026, con Hex 3.3.0.

- **Binario:** `/Applications/Hex.app/Contents/MacOS/hex`. No está en el `PATH`.
- **Comandos:**
  - `hex dictation start`: empieza una grabación "fijada", que termina con `stop` o con el atajo de Hex.
  - `hex dictation stop --print`: espera la transcripción y la imprime en vez de pegarla. Sale con código 4, sin imprimir nada, si no escuchó voz.
- **Códigos de salida comunes:** 0 si terminó bien, 1 si se rechazó o falló, 2 si hubo un error de uso y 3 si Hex no está corriendo. `hex start` abre Hex y espera a que responda.
- **Otros comandos:**
  - `hex status --json`: el estado de Hex.
  - `hex settings get <clave>`: lee un ajuste. El atajo de dictado actual es `dictation_hotkey`, que hoy es `⌘` derecho en modo mantener. Confirma el formato exacto con `hex settings --help`.
- **Hex no tiene "cancelar".** Para cancelar, ejecuta `stop --print` y descarta el texto.
- **Historial de Hex:** `hex history --since <RFC 3339> --limit <n> --json` lee los dictados guardados sin abrir la app. Tiene también `--grep` y `--oldest-first`. Comprueba dos cosas antes de construir H7 encima:
  - Que los dictados hechos con `--print` también quedan en el historial.
  - Qué forma tiene exactamente el JSON.

## Enfoque técnico

### Ayudante nativo (`native/j7-helper/`)

- **Qué es:** un programa en Swift de un solo archivo, si alcanza.
  - Se compila con `npm run build:helper`, que llama a `swiftc -O` y deja el resultado en `build/j7-helper` (arm64, macOS 14 o superior).
  - Se comunica en JSON, una línea por mensaje, por stdin y stdout.
- **Tecla mantenida:** un `CGEventTap` **de solo escucha** sobre `flagsChanged` y `keyDown`, que nunca bloquea teclas.
  - Códigos de tecla: 58 y 61 (`⌥` izquierdo y derecho), 55 y 54 (`⌘`), 56 y 60 (`⇧`), 59 y 62 (`⌃`), y 63 (`fn`).
  - La lógica del umbral de 200 ms y la cancelación por otra tecla de H2 va dentro del ayudante, porque ahí el tiempo es preciso.
  - Emite `holdStart`, `holdEnd` y `holdCancel`.
- **Captura de pantalla completa (`captureDisplayUnderMouse`):**
  1. Busca la pantalla donde está el mouse (`NSEvent.mouseLocation`, cruzado con `SCShareableContent.displays`).
  2. La captura con `SCScreenshotManager.captureImage`, usando `SCContentFilter(display:excludingApplications:exceptingWindows:)` y excluyendo la app de J7, cuyo PID llega como argumento. Usa resolución Retina.
  3. Guarda un PNG en la ruta indicada.
  - La reducción a 2000 px de G5 se aplica después, en el ingreso del adjunto.
- **Permisos:**
  - Grabación de pantalla: `CGPreflightScreenCaptureAccess` y `CGRequestScreenCaptureAccess`.
  - Monitoreo de entrada: `IOHIDCheckAccess` e `IOHIDRequestAccess` con `kIOHIDRequestTypeListenEvent`.

### Proceso principal

- **`src/main/native/helper.ts`:** lanza el ayudante, lo supervisa (lo reinicia si se cae) y expone una API tipada con el protocolo de `src/shared/`.
- **`src/main/voice/hex.ts`:** envuelve `status`, `start`, `dictation start`, `dictation stop --print` y `settings get`.
  - Usa tiempos máximos: 5 segundos para `start` y **120 segundos** para `stop --print` (H7).
  - Trata cada código de salida como indican H2 y H7.
  - Agrega una función `recoverSince(fecha)`, que lee el historial (ver "Hechos comprobados").
- **`src/main/capture/flows.ts`:** una máquina de estados para cada flujo, con un reloj inyectable.
  - **Captura y voz:** `idle` → `capturing` → `listening` → `transcribing` → `recovering` (solo si hace falta) → `queued` (solo si hay una respuesta en curso) → `sending` → `idle`. Las salidas alternativas son `cancelled`, `empty` y `failed`.
  - **H7 completo:** muestra los segundos desde los 3 s, permite cancelar con un botón y con `Esc`, sigue aunque la barra se esconda a propósito, agrega el texto después de lo escrito, ignora otra pulsación mientras transcribe, pone el mensaje en cola si hay una respuesta en curso, recupera el texto del historial y ofrece "Reintentar recuperar".
  - **Garantías:**
    - El texto dictado nunca se pierde: si no se puede enviar, queda en el campo de texto.
    - Hex nunca queda grabando: si algo falla, se cancela o la app se cierra mientras graba, se ejecuta `hex dictation stop` y se descarta el texto.
  - La hora de inicio de cada grabación se guarda al ejecutar `dictation start`, para poder recuperarla.
- **Atajos:**
  - "Captura y pregunta" usa `globalShortcut`, por defecto `Alt+Shift+J`.
  - "Captura y voz" usa el ayudante, por defecto `⌥` derecho.
  - Los dos se guardan en `settings.json`.
- **Interfaz:**
  - Estados de la barra de entrada: "● Escuchando… suelta ⌥ para enviar", "Transcribiendo… N s" con Cancelar, "En cola", "No se escuchó nada" y el error de H7 con "Reintentar recuperar".
  - Tarjetas de permisos (H4), con los enlaces `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture` y `…?Privacy_ListenEvent`.

### En desarrollo

Con `npm run dev`, macOS da los permisos al ejecutable de Electron dentro de `node_modules`, o a la terminal. Documenta en el reporte cómo darlos en desarrollo y qué cambia con la app empaquetada.

## Tests

- **Unitarios:**
  - Máquina de estados de los dos flujos, con un ayudante falso y un Hex falso: un script que imita cada código de salida, su salida, demoras configurables, que se cuelgue y un historial falso. Incluye:
    - Cancelar y cerrar la app mientras graba.
    - Cada caso de "Se comprueba" de H7: una demora de 40 segundos, un cuelgue con recuperación a los 120 segundos, la cola con una respuesta en curso, cancelar mientras transcribe y esconder la barra a la mitad.
  - Protocolo del ayudante (lectura y escritura de JSON, reinicio).
  - Lectura del atajo de Hex y aviso de choque (H5).
- **Del ayudante, en Swift o con un script:** la lógica del umbral y la cancelación, con eventos simulados.

## Comprobación manual

Esto lo hace el usuario o Claude con la app real; deja los pasos listos en el reporte:
- H1 con Vista Previa, con uno y dos monitores, más H6 con J7 visible y 📌 activado.
- H2: preguntar en voz alta sobre un PDF; soltar sin hablar; `⌥ 2` en otra app; Hex cerrado.
- H7: dictar unos 60 segundos seguidos, para forzar una transcripción larga, y esconder la barra mientras transcribe.
- H4 después de quitar los permisos.

## Fuera de alcance

La interfaz de ajustes de los atajos (etapa 6). Por ahora, los atajos se cambian editando `settings.json`.

## Reporte final

Con el formato de la regla 11 del plan.
