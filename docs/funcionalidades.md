# J7 Chat: lista de funcionalidades

Este documento es la referencia exacta de qué hace cada funcionalidad. Cada una tiene un código (por ejemplo, B3), y los encargos de cada etapa dicen qué códigos implementar. Una etapa no termina hasta que todos sus códigos cumplen los criterios de "Se comprueba".

Si algo no está aquí ni en [especificacion.md](especificacion.md), no se implementa. Si algo de aquí no se puede hacer, se informa; no se reemplaza en silencio por otra cosa.

---

## A · La app

**A1 · Solo en la barra de menús**
- Muestra un ícono monocromo en la barra de menús, creado a partir de `assets/icon.svg` como imagen de plantilla, para que se adapte al tema claro y oscuro.
- No aparece en el Dock ni en `⌘ Tab` (`LSUIElement`, más `app.dock.hide()` en desarrollo).
- **Se comprueba:** con la app abierta, el Dock y `⌘ Tab` no la muestran, y el ícono se ve bien en los dos temas.

**A2 · Menú del ícono**
- Al hacer clic aparece un menú con "Abrir J7 Chat" (y el atajo actual a la derecha), "Ajustes…", un separador y "Salir de J7 Chat".
- **Se comprueba:** cada opción hace lo que dice, y si se cambia el atajo, el menú muestra el nuevo.

**A3 · Una sola instancia**
- Si se abre J7 cuando ya está corriendo, no se crea una segunda copia: se muestra la barra de la que ya existe.
- **Se comprueba:** abrir la app dos veces deja un solo ícono y un solo proceso principal.

**A4 · Arranque al iniciar sesión**
- Viene activado la primera vez que se abre la app y se puede cambiar en los ajustes (J2).
- **Se comprueba:** después de cerrar sesión y volver a entrar, J7 está corriendo.

**A5 · Primer arranque**
- Crea la carpeta de datos y abre la barra con un aviso que se cierra solo: "Aprieta ⌥ J para abrir J7 desde cualquier app". Este aviso no vuelve a aparecer.
- Si falta algún programa o permiso, la app no se bloquea: el aviso aparece recién cuando se usa lo que falta.
- **Se comprueba:** borrando la carpeta de datos, el aviso aparece una sola vez.

**A6 · Salir limpio**
- Al salir, J7 cierra todos los procesos hijos (los programas, el ayudante nativo y Hex si J7 lo dejó grabando) y libera los atajos.
- **Se comprueba:** después de salir, `ps` no muestra procesos de `claude`, `codex`, `opencode` ni del ayudante que hayan sido lanzados por J7.

---

## B · La ventana

**B1 · Atajo principal**
- Por defecto es `⌥ J`, y es global. Funciona así:
  - Si la barra está escondida, aparece con el foco en el campo de texto.
  - Si está visible y tiene el foco, se esconde.
  - Si está visible sin foco (por ejemplo, con 📌 activado), toma el foco.
- **Se comprueba:** los tres casos funcionan desde Safari, Finder y una app en pantalla completa, con el teclado en español.

**B2 · Tipo de ventana**
- Es una ventana tipo panel, sin marco, con esquinas de 12 px, sombra y vidrio nativo de macOS (`vibrancy`; CSS no puede desenfocar lo que hay detrás de la ventana).
- Aparece en el escritorio y en el Space actuales, incluso sobre una app en pantalla completa.
- **Se comprueba:** se ve desenfocado lo que hay detrás, tanto en tema claro como oscuro, y aparece sobre un video de YouTube en pantalla completa.

**B3 · Tamaño**
- El ancho de la columna del chat es fijo, de 680 px.
- Sin mensajes, la altura es solo la de la barra de entrada.
- Con mensajes, crece con el contenido hasta el 70 % de la altura de la pantalla. Desde ahí, la conversación tiene su propio scroll.
- Un chat nuevo vuelve a la altura mínima.
- **Se comprueba:** una respuesta larga hace crecer la ventana hasta el tope y luego aparece el scroll; `⌘ N` la achica.

**B4 · Posición**
- Por defecto aparece centrada en la pantalla donde está el mouse, al 20 % desde arriba.
- Se puede arrastrar desde la franja superior y desde los bordes vacíos de la barra.
- Recuerda la posición de cada pantalla. Si esa pantalla ya no está conectada, vuelve a la posición por defecto.
- **Se comprueba:** si se arrastra, se esconde y se vuelve a abrir, queda donde se dejó; con dos monitores, cada uno recuerda su posición.

**B5 · Crecer hacia abajo**
- Al crecer, el borde superior queda fijo.
- Si no cabe en la pantalla, la ventana sube lo justo para seguir completa a la vista.
- **Se comprueba:** con la barra cerca del borde inferior, una respuesta larga no queda cortada.

**B6 · Esconder**
- `Esc`:
  - Si hay un menú o selector abierto, primero lo cierra.
  - Si se está editando un mensaje, cancela la edición.
  - Si no, esconde la barra.
- El mismo atajo principal también la esconde.
- Hacer clic fuera la esconde, salvo en estos casos:
  - El 📌 está activado.
  - Hay un diálogo de archivos abierto.
  - Hay una captura en curso.
  - Se está arrastrando un archivo.
- Al esconderse, el foco vuelve a la app que se estaba usando antes.
- Si hay una respuesta generándose, sigue generándose aunque la barra esté escondida.
- **Se comprueba:** cada caso anterior. Además, si se esconde a mitad de una respuesta y se vuelve antes de 5 minutos, la respuesta está completa.

**B7 · 📌 Mantener visible**
- Es un botón que se activa y desactiva. Activado, la barra no se esconde al perder el foco y queda por encima de las demás ventanas.
- El estado se recuerda aunque se cierre y se vuelva a abrir la app.
- **Se comprueba:** con 📌 activado se puede escribir en otra app sin que la barra desaparezca.

**B8 · Historial a la izquierda (☰)**
- Hay dos formas de abrirlo y cerrarlo: el botón ☰ y `⌘ B`.
- Al abrirlo:
  - Aparece un panel de 260 px a la izquierda.
  - La ventana se ensancha hacia la izquierda, sin que la columna del chat se mueva de su lugar en la pantalla.
  - Si no hay espacio a la izquierda, la ventana completa se corre a la derecha lo justo.
- El estado (abierto o cerrado) se recuerda.
- **Se comprueba:** al abrir y cerrar el historial, el campo de texto no se mueve; cerca del borde izquierdo de la pantalla, el panel no queda cortado.

**B9 · Regla de los 5 minutos**
- Al mostrar la barra:
  - Si pasaron menos de 5 minutos desde que se escondió y había un chat abierto, muestra ese chat en la misma posición de scroll.
  - Si no, muestra un chat nuevo vacío.
- Un chat vacío no se guarda hasta que se envía el primer mensaje.
- **Se comprueba:** cambiando la hora de referencia en un test, a los 4:59 se ve el mismo chat y a los 5:01 uno nuevo.

**B10 · Atajos dentro de la barra**

| Atajo | Qué hace |
|---|---|
| `⌘ N` | Chat nuevo |
| `⌘ B` | Abre o cierra el historial |
| `⌘ F` | Abre el historial y pone el foco en su buscador |
| `⌘ ,` | Abre los ajustes |
| `⌘ .` | Detiene la respuesta en curso |
| `⌘ ⇧ C` | Copia la última respuesta |

- **Se comprueba:** cada atajo hace lo que dice.

**B11 · Foco**
- Cada vez que la barra aparece, el cursor queda en el campo de texto, salvo que se esté editando un mensaje.
- **Se comprueba:** se puede escribir apenas aparece la barra, sin hacer clic.

**B12 · Tema**
- Por defecto sigue al sistema y cambia en vivo cuando el sistema cambia.
- En los ajustes (J2) se puede fijar en claro u oscuro.
- **Se comprueba:** cambiar el modo del Mac con la barra abierta la actualiza sin reiniciar.

---

## C · Barra de entrada

**C1 · Campo de texto**
- Es multilínea y crece hasta unas 8 líneas; desde ahí tiene su propio scroll.
- `Enter` envía y `⇧ Enter` agrega una línea nueva.
- No envía mientras se está componiendo un carácter con acento o un `ñ` (composición IME).
- **Se comprueba:** escribir "¿qué?" con acento y apretar `Enter` mientras el acento está pendiente no envía el mensaje.

**C2 · Texto de ayuda**
- Cuando está vacío muestra "Pregunta algo…" en un chat nuevo y "Sigue preguntando…" en un chat con mensajes.
- **Se comprueba:** el texto cambia según el caso.

**C3 · Controles**
- De izquierda a derecha: ☰, el campo de texto, 📎 adjuntar, ✂︎ capturar zona, 🌐 web, "Pensar más", el selector de modelo, y enviar o detener.
- Los adjuntos aparecen como fichas sobre el campo de texto.
- Todos los botones tienen un tooltip en español.
- **Se comprueba:** cada control tiene su tooltip y funciona con el teclado (`Tab` y `Space`).

**C4 · Enviar y detener**
- El botón de enviar está desactivado si no hay texto ni adjuntos.
- Mientras se genera una respuesta, el botón cambia a ■ Detener, que también funciona con `⌘ .`.
- Mientras se genera, se puede escribir el siguiente mensaje, pero no se puede enviar hasta que la respuesta termine o se detenga.
- **Se comprueba:** no se pueden mandar dos mensajes seguidos mientras uno está en curso.

**C5 · 🌐 Web**
- Viene encendido en cada chat nuevo y se guarda por chat.
- Se aplica a partir del siguiente turno.
- **Se comprueba:** si se apaga en un chat y luego se vuelve a ese chat, sigue apagado; un chat nuevo parte encendido.

**C6 · Pensar más**
- Viene apagado y se guarda por chat.
- Se oculta en los modelos sin `supportsEffort`, y su valor se conserva si se vuelve a un modelo que lo soporta.
- **Se comprueba:** con un modelo que lo soporta, el turno se envía con esfuerzo alto (se ve en el registro de depuración).

---

## D · Modelos

**D1 · Registro de modelos**
- Al arrancar, J7 consulta en paralelo el estado y la lista de modelos de los programas registrados (`claude`, `codex` y `opencode`), sin bloquear la interfaz.
- Guarda el resultado durante 10 minutos y lo actualiza en segundo plano cada vez que se abre el selector.
- **Se comprueba:** el selector se abre al instante con lo que hay guardado, aunque uno de los programas tarde en responder.

**D2 · Selector**
- Muestra los favoritos agrupados por programa, en este orden: Claude, GPT, Zen gratis. Cada grupo lleva su ícono.
- Más abajo, "Ver todos" despliega la lista completa.
- Tiene un buscador por nombre y se maneja con el teclado: `↑`, `↓`, `Enter` y `Esc`.
- **Se comprueba:** escribir "son" filtra los modelos Sonnet; `Enter` elige el modelo.

**D3 · Favoritos**
- En "Ver todos" y en los ajustes, cada modelo tiene una estrella para marcarlo como favorito.
- Si no hay ningún favorito, se muestran todos los modelos.
- **Se comprueba:** al marcar una estrella, el modelo aparece entre los favoritos.

**D4 · Modelo por defecto**
- Se elige en los ajustes y lo usan los chats nuevos.
- Si no hay ninguno elegido o no está disponible, J7 usa el primero disponible en el orden Claude, GPT, Zen.
- **Se comprueba:** si se desinstala o se cambia de nombre el binario del modelo por defecto, J7 cae al siguiente sin errores.

**D5 · Programas no disponibles**
- Sus modelos no aparecen en el selector.
- Al final del selector aparece una línea: "GPT no está disponible · Ver ajustes".
- **Se comprueba:** con una ruta falsa para un programa, sus modelos desaparecen y aparece la línea.

**D6 · Cambio a mitad del chat**
- El siguiente turno usa el modelo nuevo.
- En la conversación queda una línea fina: "→ ahora con {modelo}".
- El traspaso funciona según F2.
- **Se comprueba:** se le dice a Claude "me llamo Ana", se cambia a GPT y se pregunta "¿cómo me llamo?": GPT responde Ana.

**D7 · Etiqueta de modelo**
- Debajo de cada respuesta aparece en pequeño, en gris, el nombre del modelo que la escribió.
- **Se comprueba:** en un chat mixto, cada respuesta muestra su modelo.

---

## E · Respuestas

**E1 · En vivo**
- El texto aparece mientras llega y el Markdown se muestra sin parpadeos.
- Si el usuario está al final de la conversación, la vista lo sigue. Si subió, no se le mueve la vista y aparece un botón "↓".
- **Se comprueba:** en una respuesta larga, si se sube a leer, la vista no salta.

**E2 · Pensando**
- Antes de que llegue la primera palabra aparece el indicador "Pensando…".
- Si llega razonamiento, se muestra plegado como "Razonamiento" y se puede desplegar.
- **Se comprueba:** con un proveedor de prueba que emite razonamiento, aparece plegado.

**E3 · Detener**
- Corta el turno y deja el texto parcial, marcado como "(detenido)".
- **Se comprueba:** al detener a la mitad queda el texto parcial con la marca, y se puede enviar un mensaje nuevo.

**E4 · Errores**
- El error aparece dentro de la conversación, como un bloque con color de aviso.

| Tipo | Mensaje | Botones |
|---|---|---|
| `auth` | "No hay sesión iniciada en {programa}. Abre la Terminal, ejecuta `{comando}` e inicia sesión." | Reintentar |
| `quota` | "Llegaste al límite de uso de {programa}." | Preguntar a otro modelo… |
| `unsupported` | El detalle del problema | Preguntar a otro modelo… |
| `other` | El mensaje del programa, resumido | Reintentar |

- **Se comprueba:** el proveedor de prueba (M5) puede provocar cada tipo de error y cada uno se ve como describe la tabla.

**E5 · Markdown**
- Soporta GFM completo: tablas, listas, listas de tareas y tachado.
- Los enlaces se abren en el navegador por defecto, nunca dentro de J7.
- Las imágenes remotas del Markdown no se cargan: se muestran como enlace.
- **Se comprueba:** una tabla con 4 columnas se ve bien; un enlace abre Safari o el navegador por defecto.

**E6 · Código**
- Los bloques de código usan `shiki`, con un tema que sigue al tema de la app. Cada bloque muestra la etiqueta del lenguaje y un botón Copiar que cambia a "Copiado".
- El código dentro del texto tiene su propio estilo.
- **Se comprueba:** copiar un bloque deja en el portapapeles el texto exacto, sin numeración.

**E7 · Fórmulas**
- KaTeX muestra `$…$`, `$$…$$`, `\(…\)` y `\[…\]`.
- Si una fórmula está mal escrita, se muestra como texto, sin romper la respuesta.
- **Se comprueba:** `\[\frac{a}{b}\]` se ve como fórmula, y una fórmula rota no rompe el resto de la respuesta.

**E8 · Acciones de las respuestas**
- Copiar está en todas las respuestas y copia el Markdown original.
- La última respuesta tiene además:
  - **Reintentar:** reemplaza esa respuesta por una nueva del mismo modelo, según F4.
  - **Preguntar a otro modelo…:** abre el selector y manda la misma pregunta al modelo que se elija. La nueva respuesta aparece abajo, precedida de la línea "→ {modelo} responde la misma pregunta", y ese modelo pasa a ser el del chat.
- Estas dos acciones van solo en la última respuesta porque hacerlas en respuestas anteriores crearía ramas en la conversación.
- **Se comprueba:** cada acción hace lo descrito, y en las respuestas anteriores solo está Copiar.

**E9 · Editar la última pregunta**
- La última pregunta del usuario tiene un botón ✎ que la vuelve editable en el mismo lugar.
- "Enviar" (o `Enter`) reemplaza la pregunta y vuelve a generar la respuesta, según F4. `Esc` cancela.
- **Se comprueba:** después de editar, la conversación muestra la pregunta nueva y una sola respuesta, la nueva.

**E10 · Fuentes de la búsqueda web**
- Cuando el modelo busca en la web, aparece la línea "Buscó en N sitios", que se puede desplegar. Desplegada, muestra el título (o, si no hay, el dominio) y el enlace de cada fuente.
- **Se comprueba:** con el proveedor de prueba aparece la línea, y los enlaces se abren en el navegador.

**E11 · Selección de texto**
- Todo el texto de la conversación se puede seleccionar y copiar con `⌘ C`.
- **Se comprueba:** seleccionar un párrafo y copiarlo funciona.

**E12 · Adjuntos en los mensajes**
- Los mensajes del usuario muestran sus adjuntos: las imágenes como miniaturas y el resto como fichas.
- Al hacer clic en un adjunto se abre la vista rápida de macOS (`previewFile`).
- **Se comprueba:** hacer clic en el PDF de un mensaje anterior abre la vista rápida.

---

## F · Turnos, sesiones y traspaso

**F1 · Fuente de verdad**
- La conversación que guarda J7 es la versión oficial.
- Por cada chat y cada programa, J7 guarda el `nativeSessionId` y el último mensaje que ese programa vio.
- **Se comprueba:** test unitario del servicio de chat.

**F2 · Resumen de lo que el modelo no vio**
- Antes de un turno, si el programa no vio algunos mensajes, J7 antepone este bloque:

  ```
  [Contexto de J7 Chat: en esta conversación hubo mensajes con otros modelos que no viste. Transcripción:]
  Usuario: …
  Asistente ({modelo}): …
  [Fin del contexto]
  ```

  Después del bloque va el mensaje actual.
- **Adjuntos de esos mensajes:**
  - Texto y PDF se incluyen como `[adjunto: nombre]` con su texto extraído, siempre que el resumen completo no pase de 100.000 caracteres. Si pasa, va solo el nombre.
  - Las imágenes de los últimos 4 mensajes se vuelven a adjuntar si el modelo ve imágenes.
- **Se comprueba:** test unitario con un chat Claude, luego GPT, luego Claude: el tercer turno le entrega a Claude solo lo que dijo GPT.

**F3 · Sesión perdida**
- Si no se puede retomar una sesión nativa, J7 abre una nueva y le entrega la conversación completa según F2. El usuario no ve nada distinto.
- **Se comprueba:** borrando el `nativeSessionId` guardado, el chat sigue funcionando y el modelo recuerda la conversación.

**F4 · Reintentar y editar**
- Los dos abren una sesión nativa nueva, con el resumen de la conversación hasta antes de la pregunta que se reintenta o edita.
- La respuesta anterior se borra de J7.
- **Se comprueba:** después de reintentar, el modelo no menciona la respuesta descartada.

**F5 · Instrucciones**
- Las instrucciones base y las personales se entregan al crear cada sesión nativa.
- Si las instrucciones personales cambian, las sesiones nuevas usan las nuevas. Para eso, J7 guarda en cada sesión un hash de las instrucciones; si el hash cambia, en el siguiente turno abre una sesión nueva con el resumen.
- **Se comprueba:** después de cambiar las instrucciones personales a "responde en inglés", el siguiente turno de un chat existente responde en inglés.

**F6 · Persistencia durante la respuesta**
- Lo que va llegando se guarda cada 500 ms como máximo.
- Un turno sigue corriendo aunque se cambie de chat o se esconda la barra.
- Puede haber un solo turno activo por chat.
- Cada programa atiende un turno a la vez (etapa 0). Si otro chat ya tiene un turno activo con el mismo programa, el nuevo turno espera en cola, y su barra muestra "En cola".
- **Se comprueba:** si se cambia de chat a mitad de una respuesta y se vuelve, la respuesta sigue avanzando o ya terminó.

**F7 · Procesos de los programas**
- Se precalientan 5 segundos después de arrancar la app.
- Si un proceso se cae, J7 lo reinicia una vez. Si vuelve a caerse, muestra un error `other`.
- **Se comprueba:** matar el proceso de `codex app-server` y mandar un mensaje con GPT: funciona igual.

---

## G · Adjuntos

**G1 · Arrastrar**
- Al arrastrar archivos sobre la barra aparece el aviso "Suelta para adjuntar".
- Se pueden soltar varios archivos a la vez, incluidas imágenes arrastradas desde Safari o Chrome (llegan como archivo o como datos de imagen).
- **Se comprueba:** arrastrar 3 archivos desde Finder crea 3 fichas.

**G2 · Pegar**
- `⌘ V` con una imagen en el portapapeles la adjunta como PNG.
- `⌘ V` con archivos copiados en Finder los adjunta.
- `⌘ V` con texto pega el texto de forma normal.
- **Se comprueba:** los tres casos.

**G3 · 📎 Selector de archivos**
- Abre el diálogo nativo de archivos, filtrado a los tipos permitidos y con selección múltiple.
- **Se comprueba:** solo se pueden elegir los tipos permitidos.

**G4 · ✂︎ Capturar zona**
- Esconde J7, ejecuta `screencapture -i -x <archivo>` y vuelve a mostrar J7 con la captura adjunta.
- Si se cancela con `Esc`, J7 vuelve sin adjuntar nada.
- **Se comprueba:** los dos casos. Además, J7 no aparece en la captura.

**G5 · Tipos y límites**

| Tipo | Extensiones | Tamaño máximo | Qué hace J7 |
|---|---|---|---|
| Imagen | png, jpg, jpeg, gif, webp, heic | 20 MB | Convierte HEIC a JPEG con `sips`. Reduce a 2000 px en el lado más largo. |
| PDF | pdf | 50 MB | — |
| Texto o código | txt, md, csv, json, js, ts, tsx, py, html, css, xml, yaml, yml, sh, sql y otras de texto | 2 MB | Comprueba que el contenido sea UTF-8. |

- Hasta 10 adjuntos por mensaje.
- Si el tipo no está permitido, aparece un aviso: "J7 todavía no puede leer archivos .docx". Si se pasa el tamaño, el aviso dice cuál es el máximo.
- **Se comprueba:** un `.docx`, una imagen de 25 MB y 11 archivos producen el aviso que corresponde.

**G6 · Copia de cada adjunto**
- Al adjuntar, J7 copia el archivo a `{datos}/attachments/{uuid}-{nombre}`. Los mensajes guardan esa copia, no el original.
- **Se comprueba:** si se borra el original, el adjunto del mensaje se sigue abriendo.

**G7 · PDF**
- Si el modelo tiene `supportsPdf` y el PDF está dentro de los límites nativos del programa (según los resultados de la etapa 0), J7 lo envía tal cual.
- Si no, J7 envía el texto extraído dentro de `<documento nombre="…" paginas="N">…</documento>`.
- Si el texto se pasa de 400.000 caracteres, J7 lo recorta y la ficha avisa antes de enviar: "Se enviarán las páginas 1 a X de N".
- Si el PDF no tiene texto (está escaneado) y el modelo no lo lee de forma nativa, la ficha avisa: "Este PDF es una imagen escaneada; {modelo} no puede leerlo. Prueba con Claude".
- **Se comprueba:** los tres casos, con PDF de prueba.

**G8 · Modelo que no ve imágenes**
- Si hay una imagen adjunta y el modelo no tiene `supportsImages`, aparece sobre el campo de texto: "{modelo} no ve imágenes. Cambia de modelo o quita la imagen". El botón de enviar queda desactivado hasta resolverlo.
- **Se comprueba:** con un modelo de Zen sin visión.

**G9 · Fichas**
- **Imagen:** miniatura.
- **PDF:** ícono, nombre y número de páginas.
- **Texto:** ícono y nombre.
- Todas tienen ✕ para quitar el adjunto, y al hacer clic abren la vista rápida.
- **Se comprueba:** cada tipo se ve como se describe.

---

## H · Atajos de captura y voz

**H1 · Captura y pregunta**
- Por defecto es `⌥ ⇧ J`.
  1. Si J7 está visible, se esconde y espera a desaparecer.
  2. Captura la pantalla completa donde está el mouse, sin las ventanas de J7.
  3. Muestra J7 según la regla de los 5 minutos, con la captura adjunta y el cursor en el campo de texto.
- **Se comprueba:** con un PDF abierto en Vista Previa, la captura muestra la pantalla entera con el PDF y sin J7; con dos monitores, se captura el monitor donde está el mouse.

**H2 · Captura y voz**
- Se activa manteniendo apretada una sola tecla modificadora. Por defecto es `⌥` derecho.
- **Al apretar:** si la tecla sigue apretada 200 ms sin que se apriete otra, J7:
  1. Captura la pantalla completa, como en H1.
  2. Muestra J7.
  3. Ejecuta `hex dictation start`.
  4. Muestra en la barra "● Escuchando… suelta ⌥ para enviar".
- **Al soltar:**
  1. Muestra "Transcribiendo…".
  2. Ejecuta `hex dictation stop --print`.
  3. Agrega el texto al campo y envía el mensaje automáticamente.
- **Casos especiales:**

| Caso | Qué hace J7 |
|---|---|
| Hex devuelve el código 4 (no escuchó nada) | Muestra "No se escuchó nada" durante 2 segundos, no envía, y la captura queda adjunta. |
| Se aprieta otra tecla mientras se mantiene la modificadora (por ejemplo, `⌥ 2` para escribir `@`) | Si fue antes de los 200 ms, no pasa nada. Si fue después, detiene la grabación, descarta el texto, quita la captura y, si J7 estaba escondido, lo vuelve a esconder. |
| Hex no está abierto (código 3) | Muestra "Abriendo Hex…", ejecuta `hex start` y luego empieza a grabar. |
| Hex no está instalado | Muestra un aviso con un enlace a los ajustes. |

- **Se comprueba:** cada caso de la tabla; además, escribir `@` con `⌥ 2` en otra app no activa nada.

**H3 · Ayudante nativo**
- Es un programa en Swift (`native/j7-helper`) que se comunica con J7 en JSON, una línea por mensaje, por stdio.
- **Comandos que recibe:**
  - `watchModifier`: con la tecla y el lado (izquierdo o derecho).
  - `captureDisplayUnderMouse`: con la ruta donde guardar la imagen.
  - `permissions`.
  - `generateTitle`: se agrega en la etapa 5, para I3.
- **Eventos que envía:** `holdStart`, `holdEnd` y `holdCancel`.
- Las capturas responden `{ok, path, displayId}`.
- Usa un `CGEventTap` de solo escucha (nunca bloquea teclas) y ScreenCaptureKit.
- Si el ayudante se cae, J7 lo reinicia.
- **Se comprueba:** tests de su protocolo con un ayudante falso, y una prueba manual de los eventos.

**H4 · Permisos**
- La primera vez que hace falta un permiso que no está dado, aparece una tarjeta en la barra:
  - "J7 necesita el permiso de Grabación de pantalla para capturar", con un botón "Abrir Ajustes del Sistema" que lleva directo al panel de Privacidad correspondiente.
  - Lo mismo para Monitoreo de entrada.
- **Se comprueba:** después de quitar los permisos en Ajustes del Sistema, aparece cada tarjeta y su botón abre el panel correcto.

**H5 · Choque con Hex**
- Si la tecla de voz de J7 es la misma que el atajo de dictado de Hex (se lee con `hex settings get`), los ajustes muestran un aviso.
- **Se comprueba:** elegir `⌘` derecho muestra el aviso.

**H6 · J7 fuera de las capturas**
- Ninguna captura incluye ventanas de J7.
- **Se comprueba:** con J7 visible y 📌 activado, la captura de pantalla completa no lo muestra.

**H7 · Transcripción lenta o fallida**
- **Al soltar la tecla:**
  - Aparece "Transcribiendo…".
  - A partir de los 3 segundos muestra los segundos que lleva, por ejemplo "Transcribiendo… 8 s", con un botón Cancelar. `Esc` también cancela. Cancelar descarta la grabación, pero la captura queda adjunta.
- **No hay un tiempo máximo corto:** `hex dictation stop --print` puede tardar hasta 120 segundos.
- **Mientras transcribe:**
  - La barra no se esconde al perder el foco.
  - Si el usuario la esconde a propósito con el atajo, la transcripción sigue y el mensaje se envía igual.
  - Se puede seguir escribiendo. El texto dictado se agrega después de lo que se haya escrito.
  - Si se vuelve a mantener la tecla de voz, no empieza otra grabación y aparece el aviso "Espera a que termine la transcripción".
- **Si hay una respuesta generándose** en ese chat cuando llega el texto, el mensaje queda en cola, con el indicador "En cola", y se envía apenas la respuesta termina.
- **Si `stop --print` falla o pasan los 120 segundos:**
  1. J7 intenta recuperar el texto con `hex history --since <inicio de la grabación> --limit 1 --json`.
  2. Si lo recupera, el flujo sigue normalmente.
  3. Si no, aparece "Hex no devolvió la transcripción. La grabación quedó en el historial de Hex", con un botón "Reintentar recuperar". La captura queda adjunta.
- **El texto dictado nunca se pierde.** Si el envío falla, queda en el campo de texto.
- **Se comprueba** con un Hex falso:
  - Si tarda 40 segundos, J7 espera, muestra el tiempo y envía.
  - Si se cuelga, a los 120 segundos J7 recupera el texto del historial falso.
  - Con una respuesta en curso, el mensaje queda en cola y se envía después.
  - Cancelar descarta la grabación y deja la captura.
  - Si la barra se esconde a la mitad, el mensaje se envía igual.

---

## I · Historial

**I1 · Base de datos**
- Es SQLite y vive en `{datos}/j7.db`, con migraciones versionadas.
- **Tablas:**
  - `chats`: id, title, title_source (`auto` o `manual`), created_at, updated_at, pinned, model, provider, web_search, effort.
  - `messages`: id, chat_id, role (`user`, `assistant`, `marker` o `error`), content, model, provider, status (`complete`, `streaming`, `stopped`, `error` o `interrupted`), created_at y meta en JSON (fuentes, razonamiento, avisos).
  - `attachments`: id, message_id, kind, name, mime, path, size, pages, text_path.
  - `provider_sessions`: chat_id, provider, native_session_id, last_seen_message_id, model, instructions_hash.
- Un índice FTS5 cubre los títulos y el contenido de los mensajes.
- **Se comprueba:** tests de las migraciones y de las operaciones de lectura y escritura.

**I2 · Cuándo nace un chat**
- Un chat se guarda al enviar su primer mensaje.
- **Se comprueba:** abrir y cerrar la barra sin escribir no crea chats.

**I3 · Títulos automáticos**
- Cuando termina la primera respuesta, J7 genera el título en segundo plano con **Apple Intelligence**, a través del comando `generateTitle` del ayudante nativo (H3), que usa el framework FoundationModels. Así no gasta ninguna cuota. La instrucción es: "Título de 3 a 6 palabras, en el idioma de la conversación, sin comillas ni punto final".
- Si Apple Intelligence no está disponible, tarda más de 15 segundos o falla, el título son las primeras 6 palabras de la pregunta.
- Un título renombrado a mano (`manual`) nunca se reemplaza.
- **Se comprueba:** test con un proveedor de títulos falso: éxito, fallo y título renombrado a mano.

**I4 · Panel del historial**
- Arriba tiene un buscador.
- Los chats aparecen en grupos: Fijados, Hoy, Ayer, Últimos 7 días y Anteriores, según `updated_at`.
- Cada chat muestra su título y el ícono del programa de su último modelo. El chat abierto aparece resaltado.
- Al hacer clic se abre el chat, y el panel queda abierto.
- **Se comprueba:** con chats de prueba de distintas fechas, cada uno cae en su grupo.

**I5 · Búsqueda**
- Espera 150 ms después de la última tecla y busca en títulos y mensajes, por prefijo.
- Cada resultado muestra un fragmento con la coincidencia resaltada. Si no hay coincidencias: "Sin resultados".
- **Se comprueba:** buscar "fisio" encuentra un mensaje que dice "fisiología".

**I6 · Acciones sobre un chat**
- Se abren con clic derecho o con el botón ⋯.
- **Fijar o Desfijar.**
- **Renombrar:** se edita en el mismo lugar; `Enter` guarda y `Esc` cancela.
- **Borrar:**
  - Pide confirmación: "¿Borrar «{título}»? No se puede deshacer".
  - Borra el chat, sus mensajes, sus archivos adjuntos y sus sesiones.
  - Si era el chat abierto, muestra un chat nuevo.
- **Se comprueba:** después de borrar, sus archivos en `{datos}/attachments` ya no existen.

**I7 · Retomar un chat**
- Al abrir un chat se recupera su modelo, su 🌐 y su "Pensar más", y la vista baja al final.
- **Se comprueba:** abrir un chat que usaba GPT con 🌐 apagado lo muestra así.

**I8 · Rendimiento**
- El panel carga los 200 chats más recientes y carga más al llegar al final de la lista.
- **Se comprueba:** test unitario: con 2.000 chats de prueba, la consulta del panel tarda menos de 50 ms.

**I9 · Respuestas interrumpidas**
- Al arrancar, los mensajes que quedaron en `streaming` (porque la app se cerró a mitad de una respuesta) pasan a `interrupted` y se muestran con la marca "(interrumpido)".
- **Se comprueba:** test unitario.

---

## J · Ajustes

**J1 · Ventana de ajustes**
- Es una ventana normal, no tipo panel. Se abre desde el menú o con `⌘ ,`.
- Secciones: General, Atajos, Modelos, Instrucciones, Programas y Permisos.
- Los ajustes se guardan en `{datos}/settings.json` y se aplican en vivo.
- **Se comprueba:** cada cambio se aplica sin reiniciar la app.

**J2 · General**
- Tema: Sistema, Claro u Oscuro.
- Arrancar al iniciar sesión: interruptor.

**J3 · Atajos**
- Hay un grabador para cada uno de los tres atajos:
  - **Abrir barra** y **Captura y pregunta:** combinaciones con al menos una tecla modificadora.
  - **Captura y voz:** una sola tecla modificadora, eligiendo el lado (`⌥`, `⌘`, `⌃` o `⇧`, izquierdo o derecho) o `fn`.
- **Validaciones:**
  - Si no se puede registrar porque otra app lo usa: "Ese atajo ya lo usa otra app".
  - Si se repite entre los atajos de J7, también avisa.
  - Muestra el aviso de H5.
- Tiene un botón "Restaurar atajos predeterminados".
- **Se comprueba:** un nuevo atajo funciona apenas se guarda, y el anterior deja de funcionar.

**J4 · Modelos**
- El modelo por defecto y la lista completa de modelos, agrupados por programa y con su estrella de favorito.

**J5 · Instrucciones personales**
- Un campo de texto de hasta 4.000 caracteres, con contador. Se guarda solo y muestra "Guardado".
- Se aplica según F5.

**J6 · Programas**
- Cada uno de `claude`, `codex`, `opencode` y Hex muestra su estado: Listo, Sin instalar, Sin sesión o Error, con el detalle.
- Cuando el estado no es "Listo", muestra el comando exacto para instalarlo o iniciar sesión, con un botón para copiarlo.
- Tiene un botón "Volver a comprobar".
- **Se comprueba:** con una ruta falsa aparece "Sin instalar" y su comando.

**J7 · Permisos**
- Grabación de pantalla y Monitoreo de entrada, cada uno con su estado y el botón "Abrir Ajustes del Sistema".

---

## K · Empaquetado

**K1 · App**
- Usa `electron-builder` con estos datos:
  - `appId` `cl.j7.chat` y nombre "J7 Chat".
  - Arquitectura arm64 y salida `release/J7 Chat.app`, más un `.dmg`.
  - Sin firma.
  - `LSUIElement` activado.
  - Ícono `.icns` generado a partir de `assets/icon.svg`.
  - El ayudante nativo dentro de `Resources`.
  - La descripción de uso de Grabación de pantalla, en español. No hace falta la de Micrófono, porque quien graba es Hex.

**K2 · Scripts y README**
- Scripts: `npm run dev`, `npm run build` y `npm run dist`.
- El README explica cómo instalar la app: copiarla a Aplicaciones, la primera apertura con clic derecho y "Abrir", los permisos y cómo actualizarla.

**K3 · Avisos de terceros**
- `THIRD_PARTY_NOTICES.md` incluye la licencia MIT de T3 Code y de cualquier código copiado.

---

## L · Estética

**L1 · Base de T3 Code**
- Las variables de color, radios, sombras y tipografía se toman de `.reference/t3code/apps/web/src/index.css` y se adaptan al tema de Tailwind 4. Los íconos son de Lucide.

**L2 · Legibilidad sobre el vidrio**
- Los fondos semitransparentes se calibran para que el texto tenga un contraste AA en los dos temas, aunque detrás haya un fondo blanco, negro o una foto.
- **Se comprueba:** Claude lo revisa con la app real, sobre un fondo claro y uno oscuro, en los dos temas.

**L3 · Animaciones**
- Solo dos, de 150 ms: abrir o cerrar el historial y aparecer la barra. Sin ninguna otra animación.

**L4 · Accesibilidad**
- Todos los botones tienen `aria-label` y tooltip en español, y se ve el foco al navegar con el teclado.

---

## M · Calidad transversal

**M1 · Idioma**
- Todos los textos de la interfaz están en español y viven en un solo archivo (`src/renderer/strings.ts`).

**M2 · Seguridad**
- El renderer corre con `contextIsolation`, `sandbox` y sin `nodeIntegration`.
- El preload expone solo una API tipada.
- Tiene una CSP estricta y no carga contenido remoto.
- **Se comprueba:** revisión del código y test de que `window.require` no existe.

**M3 · Registros**
- `{datos}/logs/main.log` rota a los 5 MB.
- Se registran eventos y errores, nunca el contenido de los mensajes ni de los adjuntos.

**M4 · Tests**
- `npm test` cubre la lógica del proceso principal.
- `npm run test:e2e` es **un solo recorrido** del flujo principal, que se arma en la etapa 6 con Playwright, Electron y el proveedor de prueba: abrir, escribir, recibir respuesta, cambiar de modelo, adjuntar y encontrar el chat en el historial.
- El resto de la interfaz lo comprueba Claude con la app real al cerrar cada etapa, siguiendo los "Se comprueba".

**M5 · Proveedor de prueba**
- Es el proveedor `mock`, que solo existe cuando `J7_MOCK=1`.
- Responde en vivo con contenido de prueba según comandos en el mensaje:

| Comando | Qué emite |
|---|---|
| `/md` | Markdown con tabla, código y fórmula |
| `/think` | Razonamiento |
| `/web` | Fuentes de búsqueda web |
| `/err auth`, `/err quota`, `/err unsupported`, `/err other` | El error de ese tipo |
| `/slow` | Una respuesta lenta |

- Permite probar toda la interfaz sin gastar cuotas.
