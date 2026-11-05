# Encargo: etapa 3, adjuntos

Repo: `/Users/joaco/.t3/projects/j7-chat`.

Antes de empezar, lee `docs/especificacion.md`, `docs/funcionalidades.md`, `docs/plan.md`, `docs/etapa-0-resultados.md` (en especial la sección de PDF e imágenes de cada programa) y los reportes de las etapas anteriores.

## Objetivo

Adjuntar imágenes, capturas, PDF y archivos de texto, arrastrando, pegando, desde el selector de archivos o con el botón de captura. Cada programa recibe cada tipo de la forma que mejor maneja.

## Códigos que implementas

G1, G2, G3, G4, G5, G6, G7, G8, G9 y E12.

## Enfoque técnico

- **`src/main/attachments/`:**
  - **`index.ts`:** el punto de entrada. Valida el tipo y el tamaño según G5, copia el archivo según G6 y devuelve un `Attachment` con su metadata (páginas y si hay texto).
  - **`image.ts`:** convierte HEIC a JPEG y reduce a 2000 px con `sips`, que viene en macOS.
  - **`pdf.ts`:** viene de la etapa 0. Extrae el texto por página, para poder recortar por páginas (G7).
  - **`text.ts`:** comprueba que el archivo sea UTF-8.

- **Archivos arrastrados (G1):** en el preload, usa `webUtils.getPathForFile(file)`, porque Electron ya no ofrece `File.path`. Las imágenes que llegan como datos y no como archivo se guardan primero como un archivo temporal.

- **Pegar (G2):** en el proceso principal, `clipboard.readImage()` para imágenes, y para los archivos copiados en Finder, la lectura de `public.file-url` del portapapeles.

- **Diálogo (G3):** `dialog.showOpenDialog` con los filtros de G5. Mientras está abierto, activa `suppressHide` para que la barra no se esconda.

- **Captura de zona (G4):**
  1. Activa `suppressHide`.
  2. Esconde la barra.
  3. Ejecuta `screencapture -i -x <ruta temporal>`.
  4. Vuelve a mostrar la barra.
  5. Si el archivo no existe, el usuario canceló.

- **Miniaturas:** se sirven con un protocolo propio, `j7-file://attachment/<id>`, registrado con `protocol.handle`. Solo entrega archivos de `{datos}/attachments`. Agrégalo a la CSP.

- **Vista rápida (G9, E12):** `BrowserWindow.previewFile(ruta)`.

- **Cómo se entrega a cada programa:**
  - La estrategia de cada programa sale de `docs/etapa-0-resultados.md`: imagen nativa, PDF nativo o texto extraído.
  - Los límites nativos de PDF de cada programa van en una constante, con un comentario que cite la etapa 0.
  - G7 decide qué se envía y G8 bloquea el envío cuando corresponde.
  - Los adjuntos de los mensajes anteriores, en el resumen de F2, siguen las reglas de F2.

- **Interfaz:**
  - Aviso "Suelta para adjuntar" (G1).
  - Fichas de adjuntos (G9), con los avisos de G7 y G8 visibles antes de enviar.
  - Adjuntos dentro de los mensajes (E12).

## Tests

- **Unitarios:**
  - Tipos y límites de G5, incluidos un `.docx`, una imagen de 25 MB, 11 archivos y un texto que no es UTF-8.
  - Conversión de HEIC (genera uno con `sips`).
  - Reducción de tamaño de imágenes.
  - Recorte de PDF por páginas.
  - Detección de PDF escaneado (sin texto).
  - Copia y ruta (G6).
  - El protocolo `j7-file` rechaza rutas fuera de la carpeta de adjuntos.
- **De punta a punta, con el `mock`:**
  - 📎 con un archivo de prueba, usando `setInputFiles`.
  - Pegar una imagen.
  - Arrastrar archivos, simulando el evento con `DataTransfer`.
  - Ficha con ✕.
  - Aviso de G8 con un modelo `mock` sin visión.
  - Aviso de recorte de G7.
  - El adjunto se ve en el mensaje (E12).

## Comprobación manual con programas reales

- Un PDF de unas 30 páginas a Claude y a GPT: una pregunta sobre la página 25.
- Una captura de zona a Gemini.
- Un archivo `.py` a un modelo de Zen.
- G4 cancelado con `Esc`.
- G6: borrar el original y volver a abrir el adjunto.

## Fuera de alcance

Los atajos de captura y voz (etapa 4), Word y PowerPoint.

## Reporte final

Con el formato de la regla 11 del plan.
