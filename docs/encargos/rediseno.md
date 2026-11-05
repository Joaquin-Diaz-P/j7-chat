# Rediseño de la interfaz: códigos N1–N22

Decidido con el usuario el 2026-11-05. Reemplaza lo que contradiga a la sección L de `funcionalidades.md` y a la descripción de la barra en `especificacion.md`.

**Referencias en el repo:**
- `docs/evidence/ventana-referencia.png`: cómo se ve la ventana.
- `docs/evidence/selector-t3-referencia.png`: el selector de modelos.
- `docs/evidence/logo-j7-referencia.png`: el logo.

**Idea general:** minimalista, igual a la referencia. Una ventana gris casi negra y opaca, con una tarjeta-caja abajo que tiene "Pregunta lo que quieras", 📎 a la izquierda y el ícono del proveedor con el nombre del modelo a la derecha. Nada más a la vista.

---

## Etapa 7a · Base visual, ventana y caja

**N1 · Logo**
- Redibuja el logo de `logo-j7-referencia.png` como SVG vectorial limpio:
  - Una J con el gancho redondo y un 7 de trazo diagonal, unidos por la barra superior.
  - La esquina superior derecha del 7 es redondeada.
  - Grosor de trazo uniforme.
- **Archivos:**
  - `assets/logo.svg`: solo el trazo, en `currentColor`.
  - `assets/icon.svg`: J7 blanco sobre un squircle negro de macOS (1024 × 1024, margen de la grilla de íconos de Apple, un leve degradado #1C1C1E→#0A0A0A).
  - Regenera `icon.icns`, `iconTemplate.png` (18 px) e `iconTemplate@2x.png` (36 px). Las plantillas son solo el trazo negro sobre fondo transparente, para que macOS las adapte.
  - Si existe un script que las genera, úsalo y actualízalo. Si no, crea `scripts/build-icons.mjs` (o `.sh` con `sips`/`iconutil`) y documéntalo.
- **No se usa dentro de la ventana.**
- **Se comprueba:**
  - El SVG renderiza en un `<img>` en 16, 32 y 512 px sin deformarse.
  - Los PNG tienen las dimensiones correctas.
  - `icon.icns` contiene los tamaños de 16 a 1024.
  - El usuario confirma el parecido.

**N2 · Fondo sólido y tokens**
- Se quita `vibrancy` y `visualEffectState`. La ventana sigue `transparent` solo para tener esquinas redondeadas y sombra dibujadas en CSS.
- Tokens en `src/renderer/styles/theme.css`, con oscuro y claro:

| Token | Oscuro | Claro |
|---|---|---|
| `--surface` (ventana) | `#1C1C1E` | `#FAFAF9` |
| `--surface-raised` (caja, burbuja, panel) | `#2A2A2D` (o `rgba(255,255,255,.04)` sobre surface) | `#FFFFFF` |
| `--border` (borde de ventana) | `rgba(255,255,255,.10)` | `rgba(0,0,0,.10)` |
| `--border-raised` (borde de caja) | `rgba(255,255,255,.12)` | `rgba(0,0,0,.12)` |
| `--text` | `#ECECEC` | `#1C1C1E` |
| `--text-muted` (placeholder, etiquetas) | `#8E8E93` | `#8E8E93` |

- **Formas:**
  - Ventana con radio de 12 px, borde de 1 px `--border` y sombra suave grande.
  - Caja con radio de 12 px, borde de 1 px `--border-raised` y fondo `--surface-raised`.
- **Tipografía:** la del sistema (`-apple-system`, SF Pro), 14 px. El placeholder es `--text-muted`.
- El tema sigue al sistema o al ajuste (B12 sigue vigente).
- **Se comprueba:** con CDP, `getComputedStyle` del contenedor de la ventana y de la caja da los valores de la tabla en los dos temas. `BrowserWindow` no tiene vibrancy.

**N3 · Estado compacto**
- Al abrir con un chat vacío, la ventana es **solo la caja**: unos 520 px de ancho y la altura de la caja más un margen de 12 px alrededor. Sin franja superior ni área de conversación.
- La caja tiene dos filas:
  1. El textarea con el placeholder "Pregunta lo que quieras". Crece hasta unas 6 líneas mientras se escribe, y la ventana compacta crece con ella.
  2. La fila de herramientas: 📎 a la izquierda y el botón del modelo a la derecha.
- **Se comprueba:**
  - Con `windows.swift`, la altura compacta es menor de 140 px y el ancho es de 520 px.
  - Con CDP, no hay `.conversation` ni franja superior en el DOM.

**N4 · Paso a grande**
- Al **enviar** la primera pregunta, la ventana pasa **de una vez** a su tamaño grande: 520 × 680 px, limitado al área de trabajo. No crece con el texto de la respuesta.
- **La caja queda fija en pantalla:** la ventana crece hacia arriba, de modo que el borde inferior se mantiene. Si no cabe arriba, se corre lo justo hacia abajo para quedar dentro del área de trabajo.
- Un chat con mensajes (al reabrir antes de 5 minutos o al elegirlo en el historial) se abre directo en grande.
- `⌘ N` (chat nuevo) vuelve a compacta, con la caja en el mismo lugar.
- **Posición por defecto:** centrada horizontalmente en la pantalla del mouse, con el borde inferior de la caja al 72 % de la altura del área de trabajo. Si el usuario arrastra la ventana, se recuerda la posición del **borde inferior y del centro horizontal** (B-posición), que vale para los dos tamaños.
- Se reemplaza la lógica de `setHeight` y de crecer con el contenido de `window.ts`. Lo puramente geométrico va en una función con tests unitarios (`src/main/window-geometry.ts` o similar): compacta→grande, choque con el borde, posición recordada y otra pantalla.
- **Se comprueba:**
  - Con `windows.swift`, antes y después de enviar con `mock`: el `y + height` de la ventana no cambia, y la altura pasa a 680 en un solo paso. Durante la respuesta en vivo, la altura no cambia.
  - Con `⌘ N` vuelve a compacta con el mismo borde inferior.
  - Los tests unitarios de geometría pasan.

**N5 · Franja superior (solo en grande)**
- Mide unos 36 px y sirve para arrastrar la ventana (`-webkit-app-region: drag`; los botones, `no-drag`).
- **A la izquierda, un solo punto** de 12 px, gris (`--text-muted` al 50 %). Al pasar el mouse se pone rojo (`#FF5F57`) y muestra una ✕ chiquita oscura, como el botón de cerrar de macOS. Al hacer clic esconde J7, igual que `Esc`. Tiene `aria-label` "Esconder".
- **A la derecha, tres íconos Lucide de 16 px** en `--text-muted`, que pasan a `--text` al pasar el mouse: ☰ historial (`PanelLeft` o `Menu`), + chat nuevo (`SquarePen` o `Plus`) y 📌 fijar (`Pin`; cuando está activo, relleno o en `--text`).
- **En compacta**, los tres íconos de la derecha aparecen al pasar el mouse sobre la ventana, en una franja que flota arriba de la caja dentro de la misma ventana. La ventana compacta reserva esos ~28 px transparentes arriba, sin fondo ni borde, y solo se ven con hover o con foco de teclado. El punto no aparece en compacta.
- **Se comprueba:**
  - Con CDP, en grande existen el punto y los 3 botones con `aria-label`. El clic en el punto esconde la ventana (`isVisible` false).
  - En compacta, los tres botones existen pero tienen opacidad 0 sin hover, y opacidad 1 con `:hover` o `:focus-within` (forzado vía CDP `CSS.forcePseudoState`).

**N6 · Caja minimalista**
- **Se quitan** de la caja: ☰ (pasa a la franja), ✂, 🌐, "Pensar más" y el botón ↑ enviar.
- **📎 abre un menú pequeño** con "Adjuntar archivo…" (el diálogo actual) y "Capturar zona" (la captura actual de ✂). Se navega con el teclado.
- **Se envía con Enter**, y Shift+Enter hace una nueva línea, como hoy.
- **Mientras responde**, a la derecha del modelo aparece un botón ■ detener, redondo, de 24 px y en `--text`. Desaparece al terminar. `⌘ .` sigue funcionando.
- **El botón del modelo** muestra el ícono de la marca del proveedor (N9) de 14 px y el nombre corto, por ejemplo "Opus 5.5". Desde la etapa 7b mostrará también el nivel.
- **Mensajes de estado** (captura, voz, permisos, avisos de PDF o visión): van en una línea pequeña `--text-muted` arriba del textarea, dentro de la caja, con el mismo comportamiento de hoy. Los chips de adjuntos también van dentro de la caja, arriba del textarea.
- **Se comprueba:**
  - Con CDP, la caja solo contiene el textarea, 📎 y el botón del modelo (más ■ mientras responde, con `mock`).
  - El menú de 📎 tiene las dos opciones y las dos funcionan: el diálogo se abre, y la captura queda probada por el código, porque requiere un permiso real.

**N7 · Búsqueda web siempre activa**
- Se quita el botón 🌐. La búsqueda web queda **siempre permitida** en los tres programas, como hoy cuando el botón está encendido. El modelo decide cuándo buscar.
- El campo `webSearch` puede quedarse en la base de datos por compatibilidad, pero siempre vale `true` y la interfaz no lo expone.
- **Se comprueba:**
  - Test unitario de que todo turno sale con `webSearch: true`.
  - No queda ningún `Globe` en el renderer.

---

## Etapa 7b · Selector de modelos como T3 y niveles de razonamiento

Referencia de código: `.reference/t3code/apps/web/src/components/chat/` (`ProviderModelPicker.tsx`, `ModelPickerContent.tsx`, `ModelPickerSidebar.tsx`, `ModelListRow.tsx`, `modelPickerKeys.ts`, `TraitsPicker.tsx`) e `Icons.tsx` (`OpenAI`, `ClaudeAI`). Copia la estructura visual y el comportamiento, adaptados a J7, sin traer dependencias nuevas pesadas.

**N8 · Estructura del selector**
- Popover anclado sobre el botón del modelo, dentro de la ventana. Si la ventana estaba compacta, pasa a grande con N4 antes de abrirlo. Al cerrarlo sin enviar, vuelve a compacta si el chat sigue vacío.
- **Tres columnas, como en la captura:**
  1. **Barra de íconos** (~48 px) separada por una línea fina:
     - Arriba, ⭐ **Favoritos**, con un indicador vertical de 2 px en el color de acento (`#5B7CFA`, o el azul de T3) cuando está activo.
     - Debajo, un separador y un ícono por programa listo: OpenAI, Claude y OpenCode Zen.
     - Al hacer clic en un ícono, la lista se filtra a ese grupo.
  2. **Lista:**
     - Arriba, un buscador ("Buscar modelos…", con lupa) y una línea inferior de acento cuando tiene foco.
     - Cada fila tiene el ícono de la marca, el nombre, una ✓ junto al modelo actual, una etiqueta tenue "Por defecto" en el modelo por defecto y, a la derecha, la tecla `⌘1`…`⌘9` en una píldora gris solo para los primeros 9 de la vista actual.
     - Los nombres largos se cortan con "…".
  3. **Columna de razonamiento** (~200 px), separada por una línea fina:
     - Arriba, el título "Razonamiento" y, a la derecha y en tenue, el nombre corto del modelo enfocado.
     - Debajo, los niveles del modelo **enfocado o bajo el mouse**, con "Por defecto" tenue en el nivel por defecto del programa y ✓ en el nivel elegido para ese modelo.
     - Si el modelo no tiene niveles, la columna no aparece y el popover se angosta.
- **Teclado:**
  - Al abrir, el foco va al buscador.
  - ↑↓ mueven por la lista, Enter elige, y ←→ pasan entre la lista y los niveles.
  - `⌘1`…`⌘9` eligen directamente.
  - Esc cierra.
  - Al hacer clic afuera, se cierra.
- **Favoritos y por defecto:**
  - Al pasar el mouse por una fila aparece una ☆ para marcarla como favorita.
  - El modelo por defecto se elige en los ajustes (etapa 7d) y también con un clic derecho o menú "…" en la fila, como prefiera la implementación, siempre que sea accesible.
- "Preguntar a otro modelo…" (de las respuestas) usa este mismo selector.
- Los programas no listos (D5) aparecen al pie de la lista como hoy, en tenue y con un enlace a los ajustes.
- **Se comprueba:**
  - Con CDP, al abrir existen las 3 columnas, el buscador tiene foco y los primeros modelos muestran `⌘1`…
  - `⌘2` elige el segundo modelo.
  - Con un modelo `mock` sin niveles, la tercera columna no existe.
  - ←→ y Enter en un nivel lo eligen.

**N9 · Íconos de marca**
- `src/renderer/components/ProviderIcon.tsx` con los SVG de `Icons.tsx` de T3:
  - OpenAI: monocromo `currentColor`.
  - Claude: el asterisco naranja `#D97757`.
  - OpenCode Zen: el ícono que use T3 para OpenCode. Si no lo hay, el logo de OpenCode en monocromo.
  - `mock`: el ícono Lucide `FlaskConical`.
- Reemplaza `providerIcons` de Lucide en todos lados.
- **Se comprueba:** con CDP, el botón del modelo y las filas contienen el `<svg>` correcto por programa.

**N10 · Niveles de razonamiento**
- `effort` deja de ser `"normal" | "high"` y pasa a ser un nivel con nombre: `"low" | "medium" | "high" | "xhigh" | "max"`, más los que expongan los programas.
- **Cada modelo del catálogo trae su lista de niveles y su nivel por defecto**, leídos del programa (por ejemplo, Opus 5.5 trae Low, Medium, High, Extra High, Max y Ultracode, y su "Default" es Medium):
  - **Codex:** `supportedReasoningEfforts` y `defaultReasoningEffort` de `model/list`.
  - **Claude:** los niveles que acepta el SDK y los que el modelo informe. Si no hay forma de leerlos, usa una tabla fija por familia, documentada.
  - **OpenCode:** sus `variants`.
  - **Mock:** niveles de prueba en `mock-a`, y ninguno en `mock-b`.
- Las etiquetas en español:

| Nivel | Etiqueta |
|---|---|
| `low` | Bajo |
| `medium` | Medio |
| `high` | Alto |
| `xhigh` | Muy alto |
| `max` | Máximo |
| Otros | El nombre del programa, con mayúscula inicial |

- **Nivel por modelo, recordado:**
  - Un modelo que el usuario nunca tocó parte en **Bajo** (`low`), o en el nivel más bajo que tenga si no tiene `low`. Así se mantiene la rapidez de hoy.
  - Cuando el usuario elige un nivel para un modelo, se guarda en `settings.json` (`effortByModel: { "<provider:id>": "<nivel>" }`) y ese modelo lo usa en los chats siguientes, hasta que se cambie.
  - El chat guarda el nivel con que corre cada turno.
- Se migra el `effort` viejo de la base de datos: `normal` pasa a `low`, y `high` a `high`.
- Cada adaptador pasa el nivel tal cual al programa. Si un nivel no lo acepta el programa, se baja al más cercano soportado y se registra en el log.
- **El botón del modelo de la caja** muestra el nombre y el nivel cuando el modelo tiene niveles, por ejemplo "Opus 5.5 Alto". Sin niveles, solo el nombre.
- Se quitan `thinkMore` y `effortUnsupported` de `strings.ts` si ya no se usan.
- **Se comprueba:**
  - Tests unitarios de la migración, del nivel inicial, de lo recordado por modelo y del ajuste al nivel más cercano.
  - Con CDP y `mock-a`, se elige "Alto", se envía `/think` y se recibe razonamiento. Un chat nuevo con `mock-a` sigue en "Alto", y la etiqueta del botón lo muestra.
  - `npm run typecheck` pasa.

---

## Etapa 7c · Conversación e historial

**N11 · Mensajes**
- **Pregunta del usuario:** alineada a la derecha, en una burbuja `--surface-raised` con radio de 16 px, un padding de unos 8 × 12 px y un ancho máximo del 80 %. Sin etiqueta "Tú". Sus adjuntos van como miniaturas o chips arriba de la burbuja.
- **Respuesta:** alineada a la izquierda, a todo el ancho, sin fondo, sin borde y sin etiqueta "Asistente".
- **Debajo de cada respuesta**, una fila de íconos Lucide de 14 px en `--text-muted`: copiar (`Copy`, que pasa a `Check` 1,5 s después de copiar), reintentar (`RotateCcw`) y preguntar a otro modelo (`ArrowLeftRight`, o similar). Las reglas de cuáles aparecen son las de hoy: reintentar y preguntar a otro solo en la última respuesta. A la derecha va el nombre del modelo y el nivel en `--text-muted`, 12 px.
  - En la última respuesta, la fila está siempre visible.
  - En las anteriores, aparece al pasar el mouse por la respuesta o con foco de teclado.
- **Editar la última pregunta:** un ícono ✎ (`Pencil`) aparece al pasar el mouse por la burbuja, a su izquierda. La edición en línea mantiene el estilo de la burbuja.
- **"Pensando…":** el estado de espera es un texto `--text-muted` con un leve pulso de opacidad. Esta es una excepción a L3, que el usuario aceptó implícitamente al pedir el estilo de T3; si se prefiere, puede ir sin animación. El razonamiento desplegable ("Razonamiento") y las fuentes ("Buscó en N sitios") quedan como líneas tenues desplegables, sin bordes.
- **Los avisos de cambio de modelo** ("→ ahora con GPT") son una línea centrada tenue con un separador fino.
- **Los errores** van en el estilo de una respuesta, con texto rojo tenue y un ícono de alerta.
- El área de conversación tiene un padding lateral de 20 px y se desplaza con la barra de desplazamiento fina de macOS. La caja queda fija abajo, con 12 px de margen, como en la foto.
- **Se comprueba:**
  - Con CDP y `mock`, la pregunta tiene `justify-self`/`margin-left: auto` y fondo `--surface-raised`. La respuesta no tiene fondo.
  - No existen los textos "Tú" ni "Asistente".
  - La fila de acciones de la última respuesta tiene los 3 botones con `aria-label`. Copiar deja el texto en el portapapeles.

**N12 · Historial como panel**
- **☰ abre un panel encima** del chat, dentro de la ventana:
  - Se desliza desde la izquierda en 150 ms (la animación L3 ya existente).
  - Ancho de 280 px o del 60 % de la ventana, lo que sea menor.
  - Fondo `--surface` y borde derecho de 1 px `--border`. El resto del chat queda atenuado por una capa `rgba(0,0,0,.25)`, y un clic en ella cierra el panel.
- Si la ventana estaba compacta, pasa a grande (N4) para mostrarlo. Al cerrar sin elegir un chat, vuelve a compacta si el chat sigue vacío.
- La ventana ya **no se ensancha** para el historial. Se quita la lógica de 940 px de `window.ts`.
- **Contenido:**
  - Arriba, el buscador con lupa, igual al del selector.
  - Los grupos Hoy, Ayer, Últimos 7 días y Anteriores, con un título tenue de 11 px en mayúsculas pequeñas.
  - Los fijados van arriba.
  - Cada fila es de una línea, con el título cortado con "…"; la fila activa tiene fondo `--surface-raised`.
  - Fijar, renombrar y borrar aparecen como íconos al pasar el mouse, o en un menú "…". La confirmación de borrado es en línea, con el estilo nuevo.
- Se cierra con ☰, con Esc, con el clic en la capa o al elegir un chat.
- **Atajos:** `⌘ B` abre o cierra el panel, y `⌘ F` lo abre con foco en el buscador, como hoy.
- **Se comprueba:**
  - Con `windows.swift`, abrir el historial en grande no cambia el ancho (520) ni la posición.
  - Desde compacta, pasa a 680 de alto con el borde inferior igual.
  - Con CDP, el panel tiene 280 px o menos, Esc lo cierra, y elegir un chat lo carga y cierra el panel.

---

## Etapa 7d · Ajustes

**N13 · Ventana de ajustes**
- Un `BrowserWindow` de 760 × 540 con barra de título oculta (`titleBarStyle: "hiddenInset"`, con los botones reales de macOS) y el mismo fondo sólido `--surface`.
- **Barra lateral** de 200 px, con fondo un poco distinto (`--surface-raised` al 50 %):
  - Arriba, el logo J7 (`assets/logo.svg`, 20 px, `--text`) junto a "J7 Chat", dejando espacio para los botones de la ventana.
  - Las secciones, cada una con su ícono Lucide de 16 px: General (`Settings`), Modelos (`Sparkles` o `Boxes`), Atajos (`Keyboard`), Instrucciones (`FileText`), Programas (`Plug`) y Permisos (`ShieldCheck`).
  - La sección activa tiene fondo `--surface-raised` y radio de 6 px.
- **Contenido:**
  - Título de la sección en 20 px semibold.
  - **Grupos en tarjetas** `--surface-raised`, con borde de 1 px `--border-raised` y radio de 10 px.
  - Cada fila: etiqueta a la izquierda (con una descripción opcional de 12 px tenue debajo) y el control a la derecha. Las filas van separadas por una línea fina.
- **Controles con estilo propio, no los nativos sin estilo:**
  - Interruptor (switch) para "Abrir al iniciar sesión".
  - Selector desplegable con estilo para el tema.
  - Píldoras de tecla para los atajos (`⌥` `J`), con el estado "Presiona el atajo…" mientras graba.
  - Botones secundarios con borde.
- **Modelos:**
  - La lista agrupada por programa, con el ícono de marca (N9) en cada fila.
  - En cada fila, ☆/★ de favorito, un radio o botón "Por defecto" y el nivel recordado (N10) en un menú pequeño.
- **Instrucciones:** un textarea con estilo y el contador `n/4000` abajo a la derecha.
- **Programas y Permisos:**
  - Cada programa en una fila con un punto de estado: verde (listo), ámbar (sin sesión) o rojo (sin instalar).
  - Los comandos van en un bloque `code` con un botón de copiar.
- **El mensaje "Guardado"** es un aviso tenue que desaparece solo, no un `<p>` permanente.
- Se reutilizan los componentes del renderer donde se pueda (íconos, tokens).
- Se marca resuelta la línea de la ventana de ajustes en `docs/ideas-futuras.md`.
- **Se comprueba:**
  - Con CDP sobre la ventana de ajustes, existen la barra lateral con 6 secciones con ícono y el logo.
  - Cada control funciona como antes: tema, arranque al iniciar sesión, grabar un atajo, favorito, por defecto, nivel e instrucciones con guardado.
  - No queda ningún `<select>` ni `<input type=checkbox>` sin estilo, salvo que estén ocultos tras el control con estilo.

---

## Cierre (después de 7d)

- Actualizar `docs/especificacion.md` (secciones La barra, Modelos y Estética) y la sección L de `funcionalidades.md`, apuntando a este documento.
- `npm run dist` y la prueba del usuario.
