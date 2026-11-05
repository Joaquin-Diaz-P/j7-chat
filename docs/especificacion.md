# J7 Chat: especificación de la versión 1

App de macOS para hacer consultas rápidas a varios modelos de IA desde una barra flotante que se abre con un atajo de teclado. Es de uso personal. Su historial es propio y está separado de los sitios web de cada IA.

Lo que quedó fuera de esta versión está en [ideas-futuras.md](ideas-futuras.md).

## Conexión con los modelos

J7 no usa API keys. Habla con los programas que ya están instalados en el Mac:

| Programa | Modelos | Qué cuota gasta |
|---|---|---|
| `claude` | Claude | El plan de Claude, compartido con claude.ai y Claude Code |
| `codex` | GPT | La cuota de Codex (no la de chatgpt.com) |
| `gemini` | Gemini | La cuota de Gemini CLI |
| `opencode` | **Solo los modelos gratis de OpenCode Zen** | Gratis. Otros proveedores configurados en OpenCode no se muestran, para no generar cobros |

- Cada programa corre en una carpeta vacía propia de J7, con instrucciones de chat que reemplazan sus instrucciones de agente de programación.
- **Herramientas permitidas:** solo la búsqueda web, con un botón 🌐 en la barra que viene encendido. El modelo decide cuándo buscar.
- **Herramientas bloqueadas:** leer archivos del Mac, editar archivos, ejecutar comandos y usar conectores. El modelo solo ve lo que el usuario adjunta.
- El historial de J7 es la fuente de verdad. Si se cambia de modelo a mitad de un chat, J7 le entrega al nuevo modelo la parte de la conversación que no vio.

## La barra

- **Atajo global configurable**, por defecto `⌥ J`. Si la combinación ya la usa otra app, J7 avisa.
- **Barra compacta** centrada arriba, con fondo de vidrio esmerilado nativo de macOS. Crece hacia abajo cuando llega la respuesta.
- **Botón ☰:** despliega el historial hacia la izquierda; la columna del chat no se mueve de su lugar.
- **Cómo se esconde:** con `Esc`, con el mismo atajo o al hacer clic fuera. El botón 📌 "mantener visible" la deja encima de todo.
- **Posición:** si el usuario la arrastra, J7 recuerda dónde la dejó.
- **Al abrir:** si pasaron menos de 5 minutos desde que se escondió, muestra el último chat. Si pasó más tiempo, muestra la barra vacía. `⌘ N` empieza un chat nuevo.
- **Presencia en el Mac:** solo un ícono en la barra de menús, sin ícono en el Dock. El menú tiene Abrir, Ajustes y Salir. La app arranca sola al iniciar sesión.

## Modelos

- J7 lee automáticamente la lista de modelos de cada programa.
- El usuario marca sus favoritos. El selector muestra solo esos, con "Ver todos" abajo.
- El modelo por defecto se elige en los ajustes, y todo chat nuevo parte con él.
- Se puede cambiar de modelo a mitad de un chat. En la conversación aparece una línea fina, como "→ ahora con GPT".
- El botón "Pensar más" aparece solo en los modelos que permiten elegir el nivel de razonamiento.
- Todas las respuestas tienen el botón **Copiar**. La última tiene además **Reintentar** (con el mismo modelo) y **Preguntar a otro modelo…**. En las anteriores no van, porque crearían ramas en la conversación.
- Solo se puede editar la última pregunta, y al editarla la respuesta se vuelve a generar.
- Los modelos cuyo programa no está listo no aparecen en el selector.

## Adjuntos

- **Cómo se adjunta:** arrastrando a la barra, pegando con `⌘ V`, o con el botón de captura. El botón esconde J7, permite seleccionar una zona como `⌘ ⇧ 4` y vuelve con la imagen adjunta. La primera vez, macOS pide el permiso de Grabación de pantalla.
- **Tipos en la versión 1:** imágenes, capturas, PDF y archivos de texto o código.
- **PDF:** se entrega directamente si el modelo lo soporta; si no, J7 extrae el texto y se lo pasa. Los PDF largos (papers y apuntes) son un caso de uso central: si J7 tiene que recortar el texto, debe avisarlo.
- Si el modelo elegido no ve imágenes, J7 avisa antes de enviar.
- J7 guarda una copia de cada adjunto para que el chat no se rompa si el original se mueve o se borra.

## Atajos de captura y voz

Además del atajo para abrir la barra hay dos atajos más, ambos configurables:

| Atajo | Por defecto | Qué hace |
|---|---|---|
| **Captura y pregunta** | `⌥ ⇧ J` | Saca una captura de la **pantalla completa** donde está el mouse (sin que aparezca J7), abre J7 con la captura adjunta y deja el cursor listo para escribir. |
| **Captura y voz** | Mantener `⌥` derecho | **Al apretar:** captura la pantalla completa, abre J7 y empieza a grabar con Hex (`hex dictation start`). **Al soltar:** Hex transcribe (`hex dictation stop --print`), J7 pone el texto en la barra y lo envía solo. Si Hex no escuchó nada, no envía, y la captura queda adjunta. |

- **Si la transcripción tarda:** J7 espera lo que haga falta y muestra los segundos que lleva. Mientras tanto se puede seguir escribiendo. Si Hex no devuelve el texto, J7 lo recupera del historial de Hex. El texto dictado nunca se pierde (ver H7 en funcionalidades).

- Los dos atajos siguen la regla de los 5 minutos: si J7 se usó hace poco, la captura se agrega al último chat.
- **Atajo con solo una tecla modificadora** (como `⌥` derecho): si se aprieta otra tecla mientras está apretada (por ejemplo, para escribir `@`), se cancela sin enviar nada.
- **Hex:** la transcripción usa el modelo, el idioma y el vocabulario que ya tiene configurados. Si Hex no está abierto, J7 lo abre (`hex start`). El atajo de voz de J7 tiene que ser distinto del de Hex, que hoy es `⌘` derecho.
- **Permisos de macOS:** Grabación de pantalla (para las capturas) y Monitoreo de entrada (para detectar cuándo se suelta la tecla).

## Respuestas

- **Formato:** Markdown completo (títulos, listas, tablas y negritas), código con colores y botón para copiar, y fórmulas con KaTeX.
- **Aparición:** la respuesta se va escribiendo en vivo.
- **Búsqueda web:** cuando el modelo busca, aparece una línea como "Buscó en 4 sitios" que se puede desplegar, y las fuentes quedan como enlaces.

## Historial

- **Almacenamiento:** solo local, en una base de datos SQLite dentro de `~/Library/Application Support/J7 Chat`. Sin nube.
- **Títulos:** automáticos y editables. Los genera el modelo gratis más rápido de Zen. Si eso falla, se usan las primeras palabras de la pregunta.
- **Orden:** grupos Hoy, Ayer, Últimos 7 días y Anteriores, con los chats fijados arriba.
- **Búsqueda:** un buscador arriba del historial que busca en títulos y dentro de las conversaciones.
- **Acciones:** fijar, renombrar y borrar. Borrar pide confirmación y elimina de inmediato, sin papelera.

## Personalización

- Instrucciones personales globales: un solo texto que se entrega a todos los modelos.
- Sin memoria automática.
- Interfaz en español.

## Estética

- La base visual es la de T3 Code: Tailwind, sus colores, su tipografía e íconos Lucide.
- El tema claro u oscuro sigue al sistema, y se puede fijar en los ajustes.
- El ícono es `assets/icon.svg`.

## Ajustes

- Atajo de teclado.
- Modelo por defecto y favoritos.
- Instrucciones personales.
- Tema.
- Arrancar al iniciar sesión.
- Estado de cada programa (listo, sin instalar o sin sesión iniciada), con instrucciones para resolverlo.

## Instalación

- Solo macOS, en Mac con Apple Silicon.
- Se construye localmente desde el repo y sin firma de desarrollador de Apple. La primera vez se abre con clic derecho y luego "Abrir".
- Las actualizaciones se hacen a mano, volviendo a construir la app.
