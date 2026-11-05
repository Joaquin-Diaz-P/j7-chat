# Encargo: etapa 5, historial

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Antes de empezar, lee `docs/especificacion.md`, `docs/funcionalidades.md` (secciones I y B8), `docs/plan.md` y los reportes de las etapas anteriores.

## Objetivo

Historial persistente en SQLite con un panel a la izquierda, búsqueda, títulos automáticos, chats fijados, renombrar y borrar.

## Códigos que implementas

- **Historial:** I1, I2, I3, I4, I5, I6, I7, I8, I9.
- **Ventana:** B8 y, de B10, `⌘ B` y `⌘ F`.

## Enfoque técnico

- **Motor de SQLite:**
  1. Prueba primero `node:sqlite` dentro del proceso principal de Electron, con la versión de Node que trae la app empaquetada. Comprueba que FTS5 esté disponible creando una tabla virtual.
  2. Si no funciona, usa `better-sqlite3` con `@electron/rebuild`.
  3. Documenta cuál elegiste y por qué.

- **Migraciones:** viven en `src/main/db/migrations.ts` como un arreglo versionado y se aplican con `PRAGMA user_version`. Activa el modo WAL y `foreign_keys = ON`, y usa borrado en cascada.

- **`SqliteChatStore`:** implementa la interfaz `ChatStore` de la etapa 2 y **pasa la misma suite de contrato** (`tests/unit/chat-store.contract.ts`). La app pasa a usar este store; el de memoria queda solo para los tests.

- **Búsqueda (I5):**
  - FTS5 con contenido externo, sobre `messages.content` y `chats.title`, sincronizado con triggers.
  - Antes de usar el texto de la búsqueda, escápalo (comillas y operadores) y agrégale `*` para buscar por prefijo.
  - Usa `snippet()` para los fragmentos.

- **Títulos (I3):** `src/main/titles.ts` usa el adaptador de OpenCode con el modelo gratis más rápido según las mediciones de `docs/etapa-0-resultados.md`. Ese modelo va en una constante, y el proveedor se inyecta para poder probarlo.

- **Panel (I4, I6, B8):**
  - El panel se coordina con `window.ts` para ensancharse hacia la izquierda sin mover la columna del chat.
  - Lista virtualizada o paginada de a 200 (I8).
  - Menú contextual con clic derecho y con ⋯.
  - Edición del título en el mismo lugar.
  - Confirmación al borrar.

- **Borrar (I6):** borra el chat, sus mensajes, sus sesiones y sus archivos de `{datos}/attachments`.

- **Arranque (I9):** marca como `interrupted` los mensajes que quedaron en `streaming`.

- **Regla de los 5 minutos (B9):** ahora se apoya en el chat guardado, no en memoria.

## Tests

- **Unitarios:**
  - Suite de contrato con SQLite.
  - Migraciones desde una base vacía y desde una versión anterior.
  - Búsqueda: prefijo, acentos (por ejemplo, "fisio" encuentra "fisiología") y texto con comillas.
  - Títulos: éxito, tiempo agotado y título manual.
  - Borrado en cascada, incluidos los archivos.
  - I9.
  - Agrupación por fechas, con un reloj inyectable.
- **Rendimiento (I8):** con 2.000 chats de prueba, la consulta del panel tarda menos de 50 ms y el panel abre en menos de 300 ms.
- **De punta a punta, con el `mock`:**
  - Crear chats.
  - Abrir el panel con ☰ y con `⌘ B`.
  - `⌘ F` y buscar.
  - Fijar, renombrar y borrar.
  - Retomar un chat con su modelo, 🌐 y "Pensar más" (I7).
  - Reiniciar la app y que el historial siga ahí.

## Fuera de alcance

Carpetas e importación de historial (están en las ideas a futuro).

## Reporte final

Con el formato de la regla 11 del plan.
