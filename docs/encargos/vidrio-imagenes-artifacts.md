# Vidrio, tamaño libre, imágenes y artifacts: códigos P1–P9

Decidido con el usuario el 2026-11-26. Versión objetivo: 0.3.0. Reemplaza lo que contradiga a N2 (`rediseno.md`: «se quita vibrancy») y a la sección L de `funcionalidades.md`.

Dos etapas, cada una con su commit en `desarrollo`:
- **Etapa 8a** · P1–P5: vidrio, barras de desplazamiento, interlineado, tamaño libre y títulos con `��`.
- **Etapa 8b** · P6–P9: imágenes en el chat y artifacts dentro del mensaje.

Reglas comunes:
- No rompas lo ya comprobado: estado compacto, arrastre libre entre pantallas y sobre los bordes (0.2.5–0.2.7), ocultar al hacer clic fuera, historial, voz.
- `npm run typecheck`, `npm test` y las e2e que toques deben pasar. Agrega tests para la lógica nueva (geometría, parseo de eventos, extracción de artifacts).
- Comprueba en la app real con `scripts/verify/cdp.mjs` y `scripts/verify/windows.swift` (ver `docs/plan.md`).
- Escribe al final de tu respuesta, por código, qué comprobaste y cómo.

---

## Etapa 8a

**P1 · Fondo de vidrio como Foco**
- Referencia: la app `/Applications/Foco.app` del usuario (nativa, usa `NSVisualEffectView`; en su binario aparecen `DarkGlass` y `GlassBackground`). Ábrela y compárala lado a lado.
- Todo lo que hoy es negro (`--surface` oscuro `#000`, el panel, el historial, la caja) pasa a ser **vidrio translúcido gris medio**: se ve el escritorio detrás, desenfocado, con un tinte oscuro. Mismo efecto en tema claro con tinte claro.
- Tiene que ser desenfoque real de lo que está detrás de la ventana (behind-window). `backdrop-filter` en CSS **no** sirve: dentro de una ventana transparente solo desenfoca el propio contenido.
- Problema a resolver: la ventana es un lienzo transparente fijo de 828 × 728 que no recibe clics, con la tarjeta dibujada dentro por CSS (`window-geometry.ts`). `vibrancy` de Electron cubre la ventana entera, así que pintaría todo el lienzo. Opciones, en orden de preferencia:
  1. Un `NSVisualEffectView` (material `.hudWindow` o el que más se parezca a Foco, `blendingMode = .behindWindow`, `state = .active`) que ocupe solo el rectángulo de la tarjeta, con sus esquinas redondeadas, y que siga a la tarjeta cuando cambia de tamaño o de modo. Puede ser un addon nativo pequeño (Objective‑C++ con N‑API) que recibe el handle de `getNativeWindowHandle()` y el rectángulo desde el main. Si lo eliges, intégralo en `npm run dev`, `npm run dist` y el CI («Pruebas», macos-15), y que la app firmada lo cargue.
  2. Que la ventana mida exactamente lo que la tarjeta y usar `vibrancy` de Electron. Solo si el arrastre y los cambios de tamaño siguen igual de fluidos que hoy.
- Las capas encima del vidrio usan blancos/negros con alfa en vez de colores opacos: caja del compositor, burbuja del usuario, menú del historial, selector de modelo, bloques de código. Que el texto siga leyéndose bien sobre un fondo de escritorio claro y uno oscuro.
- Separación entre historial y chat: una línea fina de 1 px con alfa, nada de un bloque de otro color.
- **Se comprueba:** captura de pantalla de la ventana sobre el fondo de escritorio actual, junto a una de Foco. Dejar las dos en `docs/evidence/`. Con CDP, ningún fondo de `.shell`, `.panel` o `.history` es opaco.

**P2 · Barras de desplazamiento finas**
- Las de hoy son gruesas y grises (se ven a la derecha del historial). Deben ser como las de GoodNotes o las de macOS en modo superpuesto: delgadas (unos 6 px de pulgar, sin carril visible), redondeadas, semitransparentes, encima del contenido sin quitarle ancho, y que se ensanchen un poco solo al pasar el puntero.
- Aplica a todas: historial, conversación, selector de modelo, bloques de código, tablas, artifacts.
- **Se comprueba:** con CDP, el ancho del contenido del historial no cambia entre una lista corta y una que hace scroll.

**P3 · Interlineado más aireado**
- Captura del usuario: listas anidadas con negritas que se ven apretadas, y la línea horizontal (`hr`) pegada al título.
- Ajustes en `.markdown`:
  - `line-height` 1.6 para el texto.
  - Separación entre ítems de lista (`li + li` unos 0.35rem) y antes de una lista anidada.
  - Títulos con margen arriba mayor que abajo (por ejemplo 1.1rem / 0.5rem).
  - `hr` con margen de 1rem arriba y abajo y color `--border`.
- **Se comprueba:** renderiza el texto de la captura (un título, un `hr`, una lista con dos niveles y negritas) y deja una captura en `docs/evidence/`.

**P4 · Tamaño libre y botón para llenar la pantalla**
- En el estado expandido (chat o historial abiertos), la tarjeta se puede agrandar o achicar **arrastrando cualquiera de sus bordes o esquinas**, como una ventana normal de macOS. El cursor cambia en los bordes.
- Tamaño mínimo: el actual de cada modo (520 de ancho sin historial, 780 con historial). Máximo: el área visible de la pantalla.
- J7 recuerda el tamaño elegido por pantalla, igual que ya recuerda la posición (`settings.positions`), y lo usa la próxima vez que se expande.
- Un botón ⤢ arriba a la derecha, junto a ☰ + y 📌, hace que la tarjeta llene el área visible de la pantalla (sin la barra de menús ni el Dock). **No** es la pantalla completa nativa de macOS; J7 sigue siendo un panel flotante. Al volver a pulsarlo (ícono ⤡) regresa al tamaño y posición anteriores. Atajo: `⌃⌘F`.
- El estado compacto (solo la caja) no cambia.
- El lienzo fijo de 828 × 728 ya no alcanza. Rediséñalo para que el lienzo crezca con la tarjeta, sin volver a meter tirones al arrastrar (ver los commits 0.2.5–0.2.7 y `tests/e2e/window-controls.spec.ts`). Ajusta `window-geometry.ts` y sus tests.
- **Se comprueba:** con `windows.swift` y `drag.swift`: agrandar desde la esquina inferior derecha, achicar hasta el mínimo, llenar y volver, ocultar y volver a abrir (recuerda el tamaño), y arrastrar entre pantallas sin tirones.

**P5 · Títulos con `��`**
- En la base real hay un chat titulado `Supresi��n de la ovulaci��n y fecundaci��n`: cada letra acentuada se cambió por dos `U+FFFD`, o sea que sus dos bytes UTF‑8 se decodificaron por separado. Encuentra dónde (generación de títulos en `titles.ts`, el ayudante Swift, la lectura de su salida, o el proveedor que entregó el texto) y corrígelo en la raíz.
- Al arrancar, los títulos que contengan `U+FFFD` se regeneran con el mecanismo que ya existe para títulos vacíos.
- **Se comprueba:** test que parte un carácter multibyte entre dos trozos de salida y obtiene el título correcto.

---

## Etapa 8b

Principio del usuario: **que funcione igual que en ChatGPT, Claude o Codex**. Lo que el modelo manda se muestra dentro del mismo chat. Preguntar cosas en J7 no deja archivos sueltos en el Mac.

**P6 · Imágenes de internet en la respuesta**
- Hoy `Markdown.tsx` convierte `![alt](url)` en un enlace. Pasa a mostrar la imagen dentro del mensaje: ancho máximo del mensaje, esquinas redondeadas, carga diferida, y si falla, el enlace de hoy.
- Clic en la imagen: la abre en grande dentro de J7 (fondo oscurecido, `Esc` cierra). Menú contextual o botones: copiar imagen, guardar como… (diálogo de guardar; nada se guarda sin pedirlo).
- Solo `https:`. Ajusta la CSP del renderer para permitir `img-src https:` y nada más.
- Agrega a `BASE_CHAT_INSTRUCTIONS` (`src/main/chat/instructions.ts`) que, cuando el usuario pida una imagen de internet y la búsqueda web esté activa, el modelo puede insertarla con Markdown `![descripción](url directa a la imagen)`.
- **Se comprueba:** con el proveedor mock, una respuesta con una imagen `https` se ve; una `http:` o `file:` no se carga.

**P7 · Generar imágenes con GPT, igual que en Codex**
- En `src/main/providers/codex.ts` está `"features.image_generation": false`. Actívalo para que pedirle una imagen a un modelo GPT funcione igual que en Codex.
- Lee el protocolo en los tipos generados (`src/main/providers/generated/codex/`) y en la versión de `codex` instalada: cómo llega la imagen generada (ítem de tipo generación de imagen, base64 o ruta) y su estado (en curso, lista, fallida).
- Mientras se genera: un recuadro con el texto «Generando imagen…» y un brillo animado, en el lugar donde aparecerá.
- Al terminar: la imagen queda dentro del mensaje, con el mismo visor y botones de P6.
- Para que el chat la siga mostrando tras reiniciar, J7 guarda una copia en su propia carpeta de datos con el mismo mecanismo que los adjuntos (metadatos en SQLite, protocolo de adjuntos). Se borra cuando se borra el chat. Si Codex dejó una copia propia en otra carpeta (por ejemplo bajo `~/.codex`), J7 la elimina después de copiarla. Nada fuera de la carpeta de datos de J7.
- Si otro proveedor recibe un pedido de imagen, se comporta como hoy (Claude y Gemini responden que no generan imágenes).
- **Se comprueba:** en la app real con un modelo GPT: «genera una imagen de un gato astronauta». Se ve el estado de carga, luego la imagen; sigue ahí tras reiniciar J7; al borrar el chat desaparece su copia; no quedan archivos nuevos en `~/.codex` ni en otras carpetas.

**P8 · Artifacts dentro del mensaje**
- Como los gráficos interactivos que muestra ChatGPT o Claude para explicar algo: pequeños, dentro de la respuesta, generados por el propio modelo en el texto. **No se crean archivos**: el artifact vive solo en el texto del mensaje, que ya se guarda en SQLite.
- Formato que entiende J7, en bloques de código con estas etiquetas:
  - ` ```html ` con un documento o fragmento completo (HTML, CSS y JS). Se muestra en vivo **solo si** el modelo lo marca como artifact: ` ```html artifact `. Un bloque `html` normal sigue siendo código con resaltado.
  - ` ```svg `: se dibuja el SVG.
  - ` ```mermaid `: se dibuja el diagrama.
- Cómo se ve:
  - Un recuadro dentro del mensaje, con el mismo radio y borde que los bloques de código, alto ajustado a su contenido (máximo unos 480 px, luego scroll interno).
  - Una barra arriba con: título (de `<title>` o el tipo), «Código» para alternar con el código fuente resaltado, copiar, y ⤢ para verlo en grande dentro de J7 (`Esc` cierra).
  - Mientras el bloque sigue llegando (streaming), se muestra el código; el artifact se dibuja cuando el bloque se cierra.
- Seguridad:
  - Se dibuja en un `<iframe sandbox="allow-scripts">` sin `allow-same-origin`, con `srcdoc`. No ve nada de J7 ni del preload.
  - Puede cargar librerías solo desde `cdn.jsdelivr.net`, `cdnjs.cloudflare.com` y `unpkg.com` (CSP dentro del `srcdoc`: `default-src 'none'`, `script-src` y `style-src` esos CDNs más `'unsafe-inline'`, `img-src data: https:`, `font-src` esos CDNs y Google Fonts). Sin `fetch` ni formularios hacia otros sitios.
  - Mermaid se incluye empaquetado en J7, sin depender de internet. Ajusta la CSP del renderer para el `iframe` con `srcdoc`.
  - Los enlaces dentro del artifact se abren en el navegador del sistema, nunca dentro de J7.
- El artifact hereda el tema (claro/oscuro) mediante una clase o variables que J7 inyecta, y su fondo es transparente para que se vea el vidrio.
- **Se comprueba:** con el mock, una respuesta con ` ```html artifact ` que usa Chart.js desde jsdelivr dibuja el gráfico; un `<script>` que intenta `fetch('https://example.com')` o leer `parent.document` falla; un bloque `svg` y uno `mermaid` se dibujan; tras reiniciar se siguen viendo; no se creó ningún archivo.

**P9 · Que los modelos sepan que pueden hacerlo**
- Agrega a `BASE_CHAT_INSTRUCTIONS` un párrafo breve: cuando un gráfico, diagrama o visualización interactiva ayude a explicar, puede responder con un bloque ` ```html artifact ` autocontenido (librerías solo de jsdelivr, cdnjs o unpkg), ` ```svg ` o ` ```mermaid `. Que sean pequeños y explicativos, y que no los use cuando bastan texto o una tabla.
- Revisa que la línea «No eres un agente de programación…» no contradiga esto.
- **Se comprueba:** en la app real, con un modelo de Claude y uno de GPT: «explícame con un gráfico interactivo la curva de disociación de la hemoglobina y el efecto Bohr». Ambos responden con un artifact que se dibuja.
