# Encargo: etapa 1b, respuestas, estética y Claude real

Repo: `/Users/joaco/.t3/projects/j7-chat`. Ya existen los adaptadores (etapa 0) y la app de Electron con su barra flotante y el chat básico con `mock` (etapa 1a).

Lee `docs/plan.md`, en especial las reglas para los subagentes, y en `docs/funcionalidades.md` solo las secciones de tus códigos.

## Objetivo

- Las respuestas se muestran con Markdown completo, código coloreado y fórmulas, en vivo y sin parpadeos.
- La barra toma la estética de T3 Code.
- Claude real se conecta como el modelo del chat.

## Códigos

- **Ventana:** de B10, `⌘ ⇧ C`.
- **Barra de entrada:** C3. Los botones que todavía no funcionan (📎, ✂︎, 🌐, "Pensar más" y el selector) se muestran desactivados, con el tooltip "Próximamente".
- **Respuestas:** E1, E2, E5, E6, E7, E11.
- **Estética:** L1, L2, L3, L4.
- **Calidad:** M1.

## Correcciones de la etapa 1a (primero)

1. **B4:** el evento `moved` también se dispara después de los `setBounds` del programa, de forma asíncrona, así que el flag `resizing` no lo filtra, y se guardan posiciones sin que el usuario arrastre. Guarda la posición solo cuando el movimiento lo hizo el usuario. Por ejemplo: ignora `moved` si los límites coinciden con los últimos que fijó el programa, o usa `will-move`.
2. **B5:** guarda un **anclaje** (la posición guardada o la de defecto) y calcula siempre los límites desde ese anclaje, no desde los límites actuales. Al achicarse, la barra tiene que volver a su anclaje.
3. **A6:** con SIGTERM, la app registra "shutdown", pero el proceso sigue vivo más de 5 segundos. Encuentra la causa y haz que salga en menos de 2 segundos, tanto con SIGTERM como con "Salir" del menú.

Agrega tests para 1 y 2 en `window-state`.

## Enfoque técnico

- **Markdown (E1, E5):**
  - Usa `react-markdown`, `remark-gfm`, `remark-math` y `rehype-katex`.
  - Vuelve a mostrar el Markdown a lo más 30 veces por segundo mientras llega la respuesta.
  - Separa la respuesta en bloques y memoriza los bloques que ya terminaron, para no volver a procesarlos.
  - Las imágenes remotas se muestran como enlace.

- **Código (E6):** `shiki` se carga una sola vez, solo con los lenguajes comunes, y colorea de forma asíncrona. Mientras tanto, el código se muestra como texto plano. Cada bloque lleva la etiqueta del lenguaje y un botón Copiar.

- **Fórmulas (E7):** antes de `remark-math`, convierte `\(…\)` y `\[…\]` a `$…$` y `$$…$$`, sin tocar los bloques de código. Si una fórmula está mal escrita, se muestra como texto.

- **Vista de la conversación (E1):** sigue el final solo si el usuario está al final; si subió a leer, muestra el botón "↓".

- **Razonamiento (E2):** muestra "Pensando…" hasta la primera palabra. Si llega razonamiento, aparece plegado como "Razonamiento".

- **Estética (L1):**
  - Copia de `.reference/t3code/apps/web/src/index.css` (solo ese archivo de la referencia) las variables de color, radios, sombras y fuentes que sirvan, en `src/renderer/styles/theme.css`, y regístralo en `THIRD_PARTY_NOTICES.md`.
  - Usa íconos de `lucide-react`.
  - Calibra la transparencia de los fondos sobre el vidrio según L2.

- **Textos (M1):** todos los textos de la interfaz en `src/renderer/strings.ts`.

- **Claude real:**
  - El `ChatService` usa el adaptador de Claude con un modelo Sonnet, o el primer Claude disponible.
  - `J7_MOCK=1` sigue forzando el `mock`.
  - Si Claude no está listo, se usa el `mock` y aparece un aviso.

## Tests (vitest)

- Conversión de fórmulas (E7), incluidos los bloques de código que no se tocan.
- División en bloques y memorización (E1).
- Que el texto de "Copiar" de un bloque sea exacto (E6).

## Al terminar

- `npm run typecheck` y `npm test` pasan.
- `npm run dev` abre la app sin errores.
- Haz **un** turno real corto con Claude, con un modelo Haiku o Sonnet.
- En el reporte, deja una lista corta de pasos para que Claude compruebe cada código, usando los comandos `/md`, `/think`, `/slow` y `/err other` del `mock`.

## Fuera de alcance

Selector de modelos, otros programas, adjuntos, historial, ajustes, captura y voz.
