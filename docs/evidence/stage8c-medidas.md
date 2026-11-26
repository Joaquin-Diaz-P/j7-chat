# Etapa 8c · Medición y límites de la verificación

2026-11-26. Rama `desarrollo`, base 1bc5927 / 0.3.0. Sin instalar, cerrar ni modificar `/Applications/J7 Chat.app`. Sin eventos físicos de ratón. Se usaron exclusivamente procesos mock con `J7_DATA_DIR` temporal. El encargo ya tenía cambios del agente principal; no se modificó.

## Método reproducible

`scripts/verify/stage8c.mjs before|after <ejecutable>` lanza la app empaquetada mediante Playwright/Electron, obtiene las métricas de Electron, mide una apertura por IPC, ejecuta `top -l 2 -s 2 -stats pid,command,cpu,idlew,power` para sus PIDs (main, renderer, GPU y utilidad), oculta y repite. Después inserta 1.000 chats y 200 mensajes alternos con código y fórmulas en la SQLite temporal. Registra una traza CDP con seis cambios del historial, scroll, búsqueda y una respuesta mock. No usa el teclado/ratón del sistema. La base se midió **antes** de sobrescribir el paquete local 0.3.0; el después usa la app firmada recién generada.

Son muestras individuales en un Mac que el usuario estaba usando; no son un benchmark controlado. Las métricas de arranque incluyen la conexión de Playwright; `showMs` incluye IPC + espera de visibilidad DOM, no mide el atajo físico ni el primer píxel del compositor. `workingSetSize` incluye memoria compartida; no equivale a los MB privados de la medición original del encargo. CPU/IDLEW proceden de la segunda muestra de top (intervalo de 2 s); IDLEW es acumulativo y no debe confundirse con una tasa. Los JSON y top originales están en `stage8c/`; las trazas comprimidas se pueden descomprimir para abrir en DevTools.

## Antes y después

| Código / medida | Antes | Después |
|---|---:|---:|
| R1/R5 · rAF p95, transiciones + scroll, 200 mensajes | 33,4 ms | 16,9 ms |
| R1/R5 · intervalos >25 ms | 13 / 123 | 1 / 159 |
| R1/R5 · máximo | 216,7 ms | 166,7 ms |
| R2 · visible quieto: CPU main / renderer / GPU | 4,8 / 2,5 / 2,0 % | 0 / 0 / 0,3 % |
| R2 · visible quieto: IDLEW main / renderer / GPU | 9 / 2 / 6 | 0 / 0 / 0 |
| R2 · oculto: CPU main / renderer / GPU | 0,1 / 0 / 0,1 % | 0 / 0 / 0,2 % |
| R2 · oculto: IDLEW main / renderer / GPU | 9 / 3 / 6 | 0 / 0 / 0 |
| R3 · working set main / renderer / GPU (mock, KiB) | 179.888 / 120.736 / 84.096 | 174.608 / 114.480 / 83.504 |
| R4 · app (du -sk, MiB) | 274,48 | 271,62 |
| R4 · app.asar (du -sk, MiB) | 24,84 | 21,96 |
| R4 · DMG (du -sk, MiB) | 128,00 | 115,76 |
| R4 · arranque → DOM listo (proxy) | 3.958 ms | 3.824 ms |
| R4 · mostrar → DOM visible (proxy) | 163 ms | 148 ms |
| R4 · chunk principal renderer (salida Vite) | ≈1,8 MB | 731 kB |
| R4 · Artifact / Mermaid (salida Vite) | ≈5,6 MB juntos | Artifact ≈6 kB + Mermaid 5.715 kB diferido |

Las medidas agrupan los cambios: **no** se ejecutó una serie aislada por cada parche. La muestra inicial tenía precarga de proveedores a los 5 s y trabajo de inicio que puede contaminar CPU visible; no atribuir toda la diferencia a quitar el sondeo de 50 ms. La carga de 200 mensajes excluye el render inicial de la traza; el muestreo rAF mide transiciones/scroll, mientras búsqueda y streaming sí están en la traza pero no en ese percentil.

## Por código

- **R1**: `window.ts` deja de enviar el destino al vidrio desde `layout`. El renderer envía rectángulo presentado y opacidad durante transición, aparición y ocultación; el addon aplica `alphaValue` y frame sin animaciones implícitas. La apertura empieza con vidrio transparente. Se elimina el escalado de aparición que desalineaba las esquinas. Se reemplaza la animación de propiedades CSS heredadas por transiciones locales de `clip-path`, `top` y `left` en dos capas vacías, evitando invalidar todo el árbol de mensajes; contenido y tipografía no se escalan. Tinte, radios y duraciones permanecen. La e2e comprueba muestras intermedias, ambos fundidos, reposo sin reportes y reapertura con movimiento reducido. **Pendiente**: grabación externa del NSVisualEffectView y prueba de cada cuadro a 16 ms, especialmente llenar/restaurar y arrastre entre pantallas. CDP no captura el vidrio que AppKit compone detrás de Chromium; IPC puede introducir desfase de un cuadro. No se afirma sincronía visual perfecta.
- **R2**: se elimina `captureTimer`; eventos `mousemove`/`mouseleave` reenviados por Electron actualizan hit testing. Durante arrastre/redimensionado se mantiene la captura explícita. Guardado de streaming: timeout de 400 ms solo cuando llegaron cambios y guardado final. El intervalo de Connections permanece únicamente durante un login activo, con timeout/cancelación; no hay sondeo de login en reposo. Pendiente verificar entrada/salida del puntero con input físico y entre pantallas.
- **R3**: precarga de 5 s restringida al modelo elegido; conserva `prepare` con las opciones de la primera respuesta. Descubrimiento obtiene modelos y cierra las conexiones ajenas; selección, colas y expiración de 10 minutos conservan proveedores ocupados y cierran los inactivos. Cierre serializado con un turno posterior. Tests con reloj falso comprueban plazo desde último uso, proveedor elegido y reutilización. **Limitación**: el descubrimiento todavía necesita arrancar brevemente CLIs ajenas para obtener su catálogo, no es arranque estrictamente diferido desde cero. No se ejecutaron proveedores reales ni una medición real de latencia/10 minutos; la memoria de la tabla usa mock.
- **R4**: Vite incluye ACP, Zod, SAX y yauzl; el paquete excluye las copias de ACP/SAX/yauzl. Claude SDK queda externo por sus módulos y descubrimiento de archivos relativos; Zod sigue instalado para sus peer dependencies. `unpdf` conserva su distribución por los recursos del worker. Mermaid solo se importa cuando el tipo es Mermaid; HTML y SVG no lo cargan. Markdown/KaTeX salen del chunk inicial y se precargan en idle; Shiki ya era diferido. Las e2e comprueban HTML/SVG/Mermaid sin conexión y persistencia. No se certifica ausencia absoluta de parpadeo en una respuesta instantánea antes de la precarga, ni latencia del atajo físico.
- **R5**: tokens consecutivos agrupados por rAF, manteniendo orden de texto/razonamiento, con flush antes de eventos terminales y snapshots. Markdown completo memoizado evita recalcular los 200 mensajes al escribir/recibir tokens. Se conserva paginación de historial de 200 filas y debounce de búsqueda. El máximo de 166,7 ms muestra que **no se cumplen 60 fps constantes**; queda localizar ese pico y medir por separado escritura/búsqueda/streaming con más repeticiones.
- **R6**: typecheck y 352 tests unitarios; 8 e2e automatizadas, 1 omitida por requerir input físico. `npm run dist` produce la app y DMG y ejecuta firma local + `codesign --verify --deep --strict`. Se lanzó la app firmada con mock para la comparación. Los scripts de captura/voz, historial, imágenes y artifacts pasan sus e2e. No se puede declarar «todas las e2e en verde»: falta la de arrastre real, intencionalmente omitida por la restricción de no interferir con el Mac.

## Comprobación final del paquete

`codesign --verify --deep --strict release/mac-arm64/J7 Chat.app` pasó y una instancia firmada con datos temporales respondió a `/md` mostrando la tabla (`SIGNED_APP_SMOKE_OK`). **Incidencia pendiente:** al cerrar inmediatamente después de aparecer la tabla, Playwright quedó esperando en `app.close()`; el log de main registró `shutdown`, pero el proceso bajo `--inspect=0` permaneció vivo incluso tras SIGTERM. Se terminaron exclusivamente sus PIDs 57281 y 57279 con SIGKILL y se eliminó su carpeta temporal. No se tocó la app instalada. La prueba de medición anterior del paquete y todas las e2e sí cerraron correctamente. Investigar cierre durante streaming con app firmada/depurador y repetir sin inspector; no está demostrado que sea una regresión del producto.

## Revisión (2026-11-26)

Correcciones:
- **R1** `src/renderer/src.tsx`: el contador `moving` de `transitionrun/transitionend` se quedaba >0 si un descendiente se eliminaba a media transición (no llega `transitionend`), dejando el rAF a 61 cuadros/s indefinidamente. Ahora el bucle sigue solo mientras la tarjeta, `.card-clip`, la propia `.shell` o las regiones tengan animaciones en curso (`getAnimations()`). Comprobado: 0 rAF/s en reposo tras aparecer, historial, respuesta, cambios rápidos y el caso de eliminación.
- **R3** `src/main/ipc.ts`, `src/main/chat/catalog.ts`: `models:refresh` (llamado 300 ms después de cada aparición) forzaba el descubrimiento y, con el cierre nuevo, arrancaba y cerraba `codex app-server` (≈66 MB) y `agy acp` (≈160 MB) en **cada** aparición. Ahora respeta la caché de 10 min (Ajustes conserva el refresco forzado). El descubrimiento ya no cierra un proveedor ocupado ni uno usado en un turno en los últimos 10 min, y `lastUsed` se registra aunque la cola no quede vacía. Prueba unitaria añadida.

Medidas propias (Playwright, `J7_DATA_DIR` temporal, mismas cargas para 1bc5927 y la rama):
- Cambios de contexto/s del proceso principal (20 s): visible 105 → 28 (mock), 165 → 36 (proveedores reales); oculto 45 → 2,4 (mock), 40 → 2,8 (reales). Renderer (≈20–30/s) y GPU (≈120–160/s) sin cambio. `IDLEW` de `top` salía 0 en ambas versiones con el Mac en uso y no discrimina.
- Pico de 166,7 ms: en la traza el renderer está ocioso (ninguna tarea >18 ms) y no recibe cuadros ~170 ms justo al empezar la traza, en la primera apertura del historial. No se reproduce en 4 tandas con o sin traza (primera apertura 18–19 ms; cada apertura/cierre del historial pierde como mucho un cuadro, 31–34 ms, por el `setBounds` de la ventana). Se atribuye al arranque de la traza o a carga del sistema.
- R3 real: Claude Haiku 678 ms (precargado), GPT-6-Luna 5,4 s (en frío), Claude de nuevo 1,1 s; `codex` sigue vivo dentro de los 10 min; las apariciones ya no lanzan otros CLI.
- R5: 300 palabras a 8 caracteres por evento: 91 actualizaciones del DOM, todas prefijo del texto final; texto mostrado = guardado (1403).
- R4: app firmada (`codesign --verify --deep --strict` OK) responde `/md` y `/visuals`; el runtime de Mermaid (5,7 MB) solo se pide con `/visuals` (`mermaid-*.js` de 61 kB es la gramática de Shiki). Cierre a media respuesta 0,4–0,6 s sin quedar vivo (sin inspector).
