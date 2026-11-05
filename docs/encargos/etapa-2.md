# Encargo: etapa 2, todos los modelos

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Lee `docs/plan.md` (reglas para los subagentes), las secciones de tus códigos en `docs/funcionalidades.md` y `docs/etapa-0-resultados.md`.

**Gemini queda fuera de la primera versión.** `gemini.ts` se conserva, pero no se registra (`REGISTERED_PROVIDERS` en `registry.ts`).

## Correcciones de etapas anteriores (primero)

1. **Arranque sin bloqueo:** hoy `selectChatProvider()` se espera antes de crear la ventana, la bandeja y el atajo, sin tiempo límite. Si Claude se cuelga, J7 nunca aparece. La ventana, la bandeja y el atajo tienen que aparecer de inmediato; los programas se conectan en segundo plano (D1, F7).
2. **Salir durante el arranque:** hoy deja vivo el proceso de Claude. La limpieza tiene que funcionar en cualquier momento (A6).
3. **E7:** `$$…$$` y `\[…\]` en una sola línea tienen que mostrarse como fórmula de bloque (`.katex-display`). Normalízalos antes de `remark-math`, poniendo los delimitadores en líneas propias, sin tocar el código. Agrega un test.
4. **L3:** la animación de 150 ms tiene que correr cada vez que aparece la barra, no solo al cargar. Por ejemplo, vuelve a activar la clase al recibir `window:state` cuando la barra se muestra.
5. **M1:** los mensajes de error para el usuario que hoy están escritos en `providers/claude.ts` y `providers/runtime.ts` pasan a `strings.ts`. Hazlo junto con E4.

## Objetivo

Los tres programas (Claude, GPT y Zen) dentro de la app, con:
- Selector con favoritos.
- Modelo por defecto.
- Cambio de modelo a mitad del chat, con traspaso.
- "Pensar más" y 🌐.
- Fuentes de la búsqueda web.
- Acciones de las respuestas.
- Edición de la última pregunta.
- Errores claros.
- Procesos de los programas supervisados.

## Códigos que implementas

- **Barra de entrada:** C5, C6.
- **Modelos:** D1, D2, D3, D4, D5, D6, D7.
- **Respuestas:** E4, E8, E9, E10.
- **Turnos y sesiones:** F1, F2, F3, F4, F5, F6, F7.

## Enfoque técnico

- **`ChatStore` (`src/main/chat/store.ts`):** una interfaz con estas operaciones:
  - `createChat`, `getChat`, `updateChat` (modelo, programa, web y esfuerzo).
  - `listMessages`, `appendMessage`, `updateMessage` (contenido, estado y meta), `deleteMessagesFrom(messageId)`.
  - `getProviderSession`, `upsertProviderSession`.

  Por ahora se implementa en memoria, en `memory-store.ts`. Escribe sus tests como una **suite de contrato reutilizable**, `tests/unit/chat-store.contract.ts`, que reciba una fábrica de stores: la etapa 5 la va a correr con SQLite.

- **Resumen (`src/main/chat/recap.ts`):** una función pura que, a partir de los mensajes y del último mensaje visto, arma el bloque de F2 respetando sus límites (100.000 caracteres y las imágenes de los últimos 4 mensajes). Debe tener tests exhaustivos, con el caso Claude → GPT → Claude de F2.

- **`ChatService`:**
  - **Algoritmo de un turno:**
    1. Resuelve el programa del modelo.
    2. Lee su sesión nativa.
    3. Si el hash de las instrucciones cambió, descarta la sesión (F5).
    4. Calcula los mensajes que el programa no vio y arma el resumen (F2).
    5. Ejecuta `runTurn`.
    6. Si retomar la sesión falla, la abre de nuevo con el resumen completo (F3).
    7. Guarda la sesión nueva y actualiza el último mensaje visto.
  - **Reintentar y editar (F4):** borran desde la respuesta (o la pregunta) y abren una sesión nueva con el resumen de lo anterior.
  - **Persistencia (F6):** guarda lo que va llegando cada 500 ms como máximo, y un turno activo por chat.
  - **Supervisión (F7):** precalienta los procesos 5 segundos después del arranque y reinicia una vez un proceso que se cae.
  - **Cola por programa (F6):** según la etapa 0, cada instancia atiende un turno a la vez. Si otro chat ya tiene un turno activo con el mismo programa, el turno nuevo espera en cola.
  - **Reinicios de Claude:** según la etapa 0, Claude reinicia su proceso con `resume` cuando cambian la web, el esfuerzo o las instrucciones. El servicio tiene que tolerarlo sin perder la sesión.

- **Registro de modelos (D1):** caché de 10 minutos y actualización en segundo plano. Los favoritos y el modelo por defecto viven en `settings.json` (D3, D4).

- **Interfaz:**
  - Selector con buscador y manejo con teclado (D2), y la línea de programas no disponibles (D5).
  - Línea de cambio de modelo (D6) y etiqueta del modelo en cada respuesta (D7).
  - Acciones de la última respuesta (E8), edición de la última pregunta (E9) y fuentes (E10).
  - Errores según la tabla de E4. Comandos de inicio de sesión: Claude, `claude` y luego `/login`; GPT, `codex login`. Zen gratis no necesita sesión, pero tiene un límite diario: su error 429 `provider.free-limit` es de tipo `quota`.

- **Proveedor `mock`:** agrega dos modelos de prueba, `mock-a` y `mock-b`, que simulen dos programas distintos. Agrega también el comando `/echo-context`, que responde con el texto exacto que recibió, para comprobar el traspaso de punta a punta.

## Tests

- **Unitarios:**
  - Resumen.
  - `ChatService`: traspaso, sesión perdida, reintentar y editar, cambio de instrucciones, persistencia en intervalos y reinicio de procesos.
  - Registro y caché.
  - Modelo por defecto cuando el elegido no está disponible.
## Al terminar

- `npm run typecheck` y `npm test` pasan.
- `npm run dev` abre la app sin errores.
- Haz como máximo **tres** turnos reales: Claude Haiku → GPT‑6‑Luna con "me llamo Ana" y luego "¿cómo me llamo?", para comprobar el traspaso.
- En el reporte, deja una lista corta de pasos para que Claude compruebe cada código con la app real y el `mock`.

## Fuera de alcance

Adjuntos, captura, voz, historial persistente y ventana de ajustes. Los favoritos se marcan desde "Ver todos" en el selector.

## Reporte final

Con el formato de la regla 11 del plan.
