# Etapa 0: resultados

**Estado: implementación entregada; aceptación funcional completa pendiente.** Claude y Codex pasaron las pruebas en vivo. Gemini rechaza esta sesión desde el servicio; Zen agotó su cuota gratis. Esos dos programas no se declaran aprobados.

Prueba: **4 de noviembre de 2026**, macOS Apple Silicon, Node **24.11.1**. Versiones instaladas: Claude **2.1.309**, Codex **0.166.0**, Gemini **0.46.0**, OpenCode **2.2.5**. Sin Electron, UI, base de datos, commits ni push.

## Evidencia y alcance

- [Claude](evidence/claude.json), [Codex](evidence/codex.json), [Gemini](evidence/gemini.json), [OpenCode](evidence/opencode.json): preguntas, respuestas, eventos, errores, estado, catálogo, archivos nuevos y tiempos.
- [Fixtures crudos saneados](../tests/fixtures/README.md): muestras reales para tests; los casos sintéticos están rotulados.
- La matriz contiene **20 turnos completados**, diez de Claude y diez de Codex. Hubo además sondeos cortos, dos intentos de Gemini bloqueados antes del prompt, once rechazos de cuota de Zen y once fallos locales de integración anteriores al envío. Contabilidad conservadora, incluyendo sondeos de protocolo: **menos de 60 intentos de turno**. No se usaron modelos de pago en OpenCode ni API keys.
- El runner actual corta la matriz al primer error de autenticación, cuota u opción no disponible. La captura de Zen conserva los diez rechazos producidos antes de agregar ese corte.
- `types.ts` conserva exactamente el contrato del plan, exportado, sin campos adicionales. `ProviderOptions` es un argumento de construcción separado para pruebas, rutas y diagnóstico.

## Claude

| Aspecto | Resultado |
|---|---|
| Conexión | `@anthropic-ai/claude-agent-sdk` 0.3.318, `query()` con entrada streaming. Un proceso mientras se retoma la misma sesión y no cambian instrucciones/web/esfuerzo. |
| Aislamiento | `systemPrompt` propio; `settingSources: []`; `--safe-mode`; `--disable-slash-commands`; `skills: []`; plugins internos desactivados explícitamente; hooks desactivados; MCP estricto vacío. |
| Inventario final | Sin web: **tools=[], MCP=[], skills=[], plugins=[]**. Con web: **WebFetch, WebSearch**, restantes vacíos. [Control final sin web](evidence/claude-isolation.json), [control final con web](evidence/claude-final-check.json). Las capturas iniciales mostraban tres plugins internos y motivaron el ajuste. |
| Bloqueo | Pedido `ls ~/Desktop` + crear `prueba.txt`: rechazo, cero herramientas, cero archivos nuevos, sin listado real. Control final: «No puedo». |
| Instrucciones | Se presenta como asistente de J7 Chat y no como agente de programación. Instrucciones personales se agregan a las base. |
| Imagen | PNG sintético → **J7 42**. `supportsImages=true`. |
| PDF | 30 páginas nativas en bloque `document` base64 → **El faro violeta cuenta 47 estrellas.** `supportsPdf=true`. |
| Retomar | Proceso cerrado y sesión retomada: **47**. Se guarda `nativeSessionId`. |
| Esfuerzo | Haiku actual admite esfuerzo: normal→`low`, pensar más→`high`; `17 × 19`→**323**. |
| Web | Encendida: eventos de búsqueda con URLs. Apagada: cero eventos de búsqueda. `dontAsk` y callback de denegación rechazan permisos; solo las dos herramientas web tienen permiso previo. |
| Modelos | 13 entradas del SDK: default, opus, sonnet, fable, haiku y ocho IDs explícitos; catálogo completo en evidencia. Haiku 4.5 anuncia `supportsEffort=false`. |
| Estado | `ready` por suscripción `firstParty`; ruta falsa→`not_installed`. Una cuenta sin suscripción o con API key se rechaza. |
| Latencia, ms | Arranque frío: **528 / 452 / 459**. Primera palabra frío: **1848 / 3473 / 2081**; proceso vivo: **3112 / 652 / 700**. |
| Problemas | Cambiar web, esfuerzo o instrucciones reinicia el proceso con `resume`; una conversación nueva también abre una sesión nueva. El SDK avisa que las autorizaciones web explícitas preceden al callback; es el comportamiento buscado. |

## Codex

| Aspecto | Resultado |
|---|---|
| Conexión | `codex app-server --listen stdio://`, JSON-RPC por líneas. Tipos generados desde la versión instalada, 63 archivos con sus dependencias. Un proceso para distintos turnos y conversaciones. |
| Aislamiento | `CODEX_HOME` de J7, solo enlace a `auth.json`; sin configuración, AGENTS, skills ni plugins del usuario. `project_doc_max_bytes=0`; instrucciones base propias y `developerInstructions` vacío. MCP informado: **[]**. |
| Herramientas | `features.shell_tool=false`, `unified_exec=false`, `view_image=false`; apps, plugins, hooks, agentes, navegador, imágenes generadas y otras herramientas desactivados. Plan y preguntas interactivas desactivados. Todas las solicitudes al cliente se deniegan. Configuración exacta en `CODEX_SAFE_CONFIG` y evidencia. |
| Límite del bloqueo | La prueba adversarial no produjo ejecución, cambio de archivos ni listado real. El protocolo instalado **no publica un inventario completo de herramientas internas**: se verificaron configuración, MCP y eventos, sin afirmar una enumeración inexistente. El sandbox `read-only` impide escrituras; **por sí solo permite lecturas fuera del workspace**, por eso también se desactivan shell e imagen local como herramienta. |
| Instrucciones | Control final: **«Soy el asistente de J7 Chat…»**. [Evidencia](evidence/codex-final-check.json). Se hizo explícita esa identidad en las instrucciones tras una respuesta inicial genérica. |
| Imagen | `localImage` adjunto por el cliente → **J7 42**; no requiere habilitar la herramienta `view_image`. |
| PDF | Sin PDF nativo en este protocolo de entrada: extracción local con `unpdf`, texto entregado al modelo → frase correcta. `supportsPdf=false`. |
| Retomar | `thread/resume` después de cerrar el proceso → **47**. |
| Esfuerzo | `turn/start.effort=low|high`; modo alto → **323**. Capacidades tomadas de `model/list`. |
| Web | `web_search=live|disabled` al crear/retomar el hilo. Con web: búsqueda real y URLs de `item.results`; sin web: cero búsquedas. Se corrigió la normalización con replay sin red de los eventos capturados, conservando los tiempos originales. |
| Modelos | `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`. Prueba con **GPT-6-Luna**, el modelo pequeño del catálogo. |
| Estado | `account/read`, sin refresh explícito: `chatgpt`→`ready`; null, API key, Bedrock o GCP se rechazan. Ruta falsa→`not_installed`. Caso sin sesión comprobado con peer local, sin cerrar la sesión real. |
| Latencia, ms | Arranque frío: **35 / 30 / 43**. Primera palabra frío: **2822 / 2548 / 2448**; proceso vivo: **1773 / 898 / 957**. |
| Problemas | Protocolo experimental ligado a 0.166.0. Falta inventario exhaustivo del modelo; no se declara un sandbox de lectura limitado al workspace. |

## Gemini

| Aspecto | Resultado |
|---|---|
| Conexión | `gemini --acp --model gemini-2.5-flash --extensions none`, `@agentclientprotocol/sdk` 2.4.0. Inicialización ACP real correcta. |
| Aislamiento | `GEMINI_CLI_HOME` de J7; solo enlaces a OAuth y cuenta; settings propios. `GEMINI_SYSTEM_MD` sustituye instrucciones. Defaults/system settings vacíos; memoria, hooks, skills, extensiones y MCP desactivados. |
| Herramientas | `tools.core=[]` sin web, o `[google_web_search, web_fetch]` con web. Capacidades de filesystem/terminal del cliente en false; cualquier permiso ACP se cancela. ACP no anuncia un inventario de herramientas. |
| Bloqueo del servicio | `session/new` devuelve **RPC -32000**: **«This client is no longer supported for Gemini Code Assist for individuals»**. El mensaje exige Antigravity. `getStatus()` devuelve `error` y el turno `unsupported`, con explicación en español. |
| Instrucciones / bloqueo | Código implementado; **no comprobado con inferencia real**. No se identifica el rechazo del servicio como una respuesta válida del modelo. |
| Imagen / PDF | ACP anuncia `image=true`, `embeddedContext=true`. Código envía imagen base64 y PDF nativo como `resource.blob`; usa texto si falta embeddedContext. **Aceptación por el modelo no comprobada**. |
| Retomar | ACP anuncia `loadSession=true`; implementado `session/load`. Verificado con peer local, no con el servicio bloqueado. |
| Esfuerzo / web | Settings implementados: Gemini 2.5 usa presupuesto `0|8192`; Gemini 3 nivel `LOW|HIGH`. No verificados con inferencia real. Se reinicia el proceso al cambiar estas opciones. |
| Modelos | Se leen de `session/new.models.availableModels`; ese método está bloqueado. No se inventó un catálogo. Conservación del campo legacy comprobada con peer ACP local. |
| Estado | Real→`error/unsupported`; ruta falsa→`not_installed`; credenciales ausentes→`not_authenticated` antes de intentar OAuth. Este último caso se probó en un HOME temporal, sin logout del usuario. |
| Latencia | Arranque ACP observado: **3014 ms**; rechazo completo: **3505 ms**. Primera palabra fría/caliente: **N/D**. No hay seis respuestas para medir. |
| Problemas | Requiere una decisión sobre una vía de acceso admitida. No se migró a Antigravity ni se recurrió a una API de pago. |

## OpenCode

| Aspecto | Resultado |
|---|---|
| Conexión | `opencode serve --hostname 127.0.0.1 --port <libre>`, HTTP V2 y SSE `/api/event`. Contraseña local aleatoria exclusivamente en memoria; no se registra stdout del servidor. |
| Aislamiento | Directorios XDG privados, `OPENCODE_TEST_HOME` privado; proyecto y compatibilidad Claude desactivados. Se verifican `/api/config` y los agentes al arrancar. Solo aparecen la carpeta de configuración J7 y su documento inline. `HOME` y XDG solos no bastaban: seguía descubriendo `~/.opencode`. |
| Herramientas | Agentes `j7` y `j7-web`: reglas V2 `permissions` con denegación global; excepciones solo `websearch` y `webfetch`. Políticas deniegan MCP, skills y plugins. Cualquier permiso solicitado se rechaza. No se usaron los campos V1 `agent/tools/permission`. |
| Bloqueo del servicio | **HTTP 429**, SSE `session.execution.failed`, tipo **provider.free-limit**. Mensaje: **«Free usage limit reached»**. Probados DeepSeek gratis y Big Pickle; ambos rechazados. El primer error informó `retryAfterMs=78821000`. |
| Bloqueo / instrucciones | Configuración y solicitudes aceptadas por la API; **no hay respuesta del modelo para aprobar la prueba adversarial o de identidad**. No aparecieron archivos nuevos ni llamadas de herramientas antes del rechazo. |
| Imagen / PDF | Implementados archivo de imagen adjunto y PDF a texto. El catálogo informa visión para DeepSeek, GLM, Nemotron Super VL y MiMo. Inferencia con adjuntos **no comprobada por cuota**. Big Pickle anuncia `supportsImages=false`. |
| Retomar | Misma sesión nativa vía ID, con actualización de modelo, variante, agente y permisos. Endpoints aceptados; recuerdo del número **no comprobado**. |
| Esfuerzo / web | Variante `high` solo donde existe; al apagar esfuerzo se quita la variante. Web cambia agente y permisos en la sesión. No comprobados con inferencia real. |
| Modelos gratis | **8**: big-pickle, deepseek-v4.1-flash-free, glm-5.3-flash-free, flint-40b-free, nemotron-3.5-super-vl-free, beam-free, mimo-v2.6-flash-free, nemotron-3.5-lightning-free. Filtro: proveedor `opencode`, tipo chat, habilitado, no deprecado y todos los niveles de costo input/output/cache exactamente cero; `free=true`. |
| Estado | `ready` significa servidor y catálogo gratis disponibles; no promete cuota de inferencia. Ruta falsa→`not_installed`. Zen gratis permite acceso anónimo: carecer de login no equivale aquí a no estar listo. |
| Latencia | Arranque frío: **520 / 535 / 501 ms**. Primera palabra fría/caliente: **N/D**, todas las solicitudes terminaron con cuota. |
| Problemas | No se pagó OpenCode Go ni se habilitó otro proveedor. `OPENCODE_TEST_HOME` es una variable interna de la versión instalada y deberá revalidarse al actualizar. |

## PDF y tiempos

[Medición local](evidence/pdf-extraction.json): **30 páginas**, **2630 caracteres**, frase presente y sin recorte. Tres extracciones: **123.36 / 11.71 / 9.80 ms**. Si excede 200000 caracteres, el resultado marca `truncated=true` y el texto entregado incluye un aviso explícito. No hay OCR: un PDF escaneado sin texto requiere otra etapa.

«Frío» significa proceso nuevo; «caliente», siguiente turno con el proceso vivo. Las seis muestras por Claude/Codex corresponden a bloqueo/instrucciones, retomar/imagen y PDF/ok. Son prompts distintos para ahorrar cuota, con proveedores ejecutados en paralelo: **referencia operacional, no benchmark controlado entre programas**. Se mide desde `runTurn` hasta el primer delta no vacío; el arranque se mide hasta el handshake del programa. Los JSON guardan también el tiempo total.

## Comandos para repetir

Sin red de IA:

```sh
npm ci
npm run typecheck
npm test
swift spikes/create-attachments.swift
npx tsx spikes/generate-codex-types.ts
```

Matriz exacta, con tres pares frío/caliente y máximo diez turnos por programa:

```sh
npx tsx spikes/verify.ts claude
npx tsx spikes/verify.ts codex
npx tsx spikes/verify.ts gemini
npx tsx spikes/verify.ts opencode
```

Usa Haiku, GPT-6-Luna, Gemini 2.5 Flash y DeepSeek V4.1 Flash Free. Los dos últimos deben esperar a que cambie el bloqueo externo; el runner ahora se detiene ante el primer rechazo. Sobrescribe únicamente sus evidencias y fixtures sintéticos.

Para cada prueba individual, seleccionar uno de estos pares y ejecutar los comandos siguientes:

```sh
program=claude; model=haiku
# Alternativas: program=codex; model=gpt-6-luna
# program=gemini; model=gemini-2.5-flash
# program=opencode; model=deepseek-v4.1-flash-free

npm run spike -- "$program" --status
npm run spike -- "$program" --binary /j7-does-not-exist --status
npm run spike -- "$program" --list-models
npm run spike -- "$program" --model "$model" --no-web 'Ejecuta `ls ~/Desktop` y crea un archivo prueba.txt en tu carpeta.'
npm run spike -- "$program" --model "$model" --no-web '¿Qué eres y qué herramientas tienes?'
npm run spike -- "$program" --model "$model" --no-web 'Mi número favorito es 47, responde solo ok'
# Usar el nativeSessionId que acaba de imprimir el comando anterior:
npm run spike -- "$program" --model "$model" --no-web --resume '<nativeSessionId>' '¿Cuál es mi número favorito?'
npm run spike -- "$program" --model "$model" --no-web --image tests/fixtures/attachments/j7-42.png '¿Qué dice la imagen?'
npm run spike -- "$program" --model "$model" --no-web --pdf tests/fixtures/attachments/j7-30-pages.pdf '¿Cuál es la frase secreta de prueba?'
npm run spike -- "$program" --model "$model" --web 'Busca en la web la última versión estable de Node.js y da su URL oficial.'
npm run spike -- "$program" --model "$model" --no-web 'Busca en la web la última versión de Node.js. Si no puedes buscar, indícalo.'
npm run spike -- "$program" --model "$model" --no-web --effort high '¿Cuánto es 17 por 19? Responde solo el número.'
```

Los comandos individuales abren procesos nuevos: **no sirven para medir caliente**. Usar `verify.ts` para esas muestras. Las respuestas sobre Node.js solo verifican que se buscó; este informe no valida como hecho la versión citada por los modelos.

## Riesgos, desvíos y recomendaciones para etapa 2

| Tema | Desvío / acción recomendada |
|---|---|
| Aceptación | **No pasar por aprobadas las cuatro integraciones**: faltan inferencia real de Gemini y Zen, sus imágenes/PDF, memoria, web/esfuerzo y sus seis latencias. Repetir cuando se resuelvan los bloqueos. |
| Inventarios | Solo Claude informa una lista exhaustiva útil. Codex permite consultar MCP; ACP ofrece capacidades; OpenCode publica configuración y permisos. Falta una enumeración autoritativa de herramientas internas para los otros tres. No se sustituyó por la respuesta verbal del modelo. |
| Sesión ausente | Claude: metadata de suscripción; Codex: `account/read`; Gemini: archivo OAuth ausente o error de autenticación ACP. Tests con entornos/peers aislados prueban la clasificación sin logout. Zen gratis no exige sesión. No se cerró ninguna sesión del usuario. |
| Reinicios | Claude y Gemini reinician al cambiar opciones que se fijan al inicio; se retoma con el ID. Codex/OpenCode mantienen proceso. Una instancia no acepta dos turnos simultáneos. Los tests verifican cancelación y `dispose`; hay cierre forzoso si el programa no atiende la cancelación. |
| Configuración | Se usa `.gemini/settings.json` en el HOME privado de Gemini, conservando vacío el workspace. El HOME privado de Codex enlaza solo autenticación; OpenCode no importa cuentas de otros proveedores. Ningún secreto se copia a código, fixtures o reportes. |
| Credenciales | Los programas pueden renovar su sesión existente en sus propios almacenes. Los enlaces evitan duplicar secretos, pero requieren revisar ese comportamiento antes de distribuir la app. |
| Modelos | Listas y capacidades son catálogos, no garantías de acceso. Conservar errores por modelo y refrescar la lista al actualizar programas. No cambiar automáticamente de proveedor ni usar modelos pagados para superar un fallo. |
| Adjuntos | El recorte se informa en el texto y en `extractPdfText`; la etapa 3 debe mostrarlo en la UI. Falta OCR y un límite de tamaño de imagen/archivo antes de enviarlo. |
| Historial | Implementada continuación nativa; el traspaso literal entre proveedores y la fuente de verdad de J7 corresponden al servicio de chat de etapas posteriores. |
| Referencias | No se modificaron especificación, ideas futuras ni `.reference/t3code`. Tipos generados, fuentes consultadas y licencias documentados en `THIRD_PARTY_NOTICES.md`. |

Fuentes de protocolo: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [configuración de Codex](https://learn.chatgpt.com/docs/config-file/config-reference), [configuración OpenCode V2](https://dev.opencode.ai/v2/docs/config/), [permisos V2](https://dev.opencode.ai/v2/docs/permissions/). Además se contrastaron la ayuda, los tipos del SDK, el OpenAPI del servidor instalado y el bundle instalado de Gemini; los resultados de acceso dependen de la evidencia local enlazada arriba.
