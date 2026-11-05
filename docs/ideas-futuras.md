# Ideas a futuro

Funcionalidades que quedaron fuera de la primera versión de J7 Chat, pero que queremos hacer después.

## Modo comparar

Hacer una pregunta y que respondan dos o tres modelos lado a lado, para comparar sus respuestas.

En la primera versión esto se cubre con el botón **"Preguntar a otro modelo…"** de cada respuesta, que reenvía la misma pregunta a otro modelo dentro del mismo chat.

## Pendientes técnicos de la versión 1

Detectados en la revisión final (etapa 6):

- **Tiempo de inicio de Hex:** el tiempo máximo de `hex dictation start` bajó de 5 s a 1 s para que el `stop` alcance a correr al salir. Si Hex tarda más de 1 s en empezar, la voz falla. Lo mejor sería volver a 5 s durante el uso normal y aplicar el límite corto solo al salir. Se confirma en el paso 5 de `docs/prueba-final.md`.
- **Firma de la app:** la firma ad-hoc tiene el identificador "Electron", así que macOS podría volver a pedir los permisos después de cada actualización. Habría que firmar ad-hoc con el identificador `cl.j7.chat`.
- **Intercambiar atajos:** si se intercambian entre sí el atajo de la barra y el de "Captura y pregunta", falla con "Ese atajo ya lo usa otra app", porque se registra el nuevo antes de soltar el viejo.
- [x] **Ventana de ajustes:** rediseñada con la estética de la barra (N13).
- **Programas en los ajustes:**
  - El detalle de `claude` dice "/login", pero el comando que muestra es `claude auth login`.
  - Se muestran los dos comandos (instalar e iniciar sesión) sin importar el estado.
  - Con `J7_MOCK=1`, todos los programas salen "Error" sin detalle.
- **Empaquetado:**
  - electron-builder agrega un `NSMicrophoneUsageDescription` en inglés que no hace falta.
  - El `app.asar` pesa 88 MB y el `.dmg` 280 MB; se puede reducir.
- **Zen gratis:** el límite diario seguía agotado durante toda la construcción, así que nunca se probó una respuesta real.

## Gemini a través de Antigravity

Google rechaza Gemini CLI con cuentas personales y pide usar Antigravity. Hay que instalar Antigravity, conectarlo por ACP como lo hace T3 Code (`apps/server/src/provider/acp/Antigravity*`) y reutilizar `src/main/providers/gemini.ts`, que ya está escrito pero no está registrado.

## Memoria automática

Que J7 recuerde datos de chats anteriores y se los entregue al modelo, como la memoria de ChatGPT. En la primera versión cada chat parte de cero, salvo por las instrucciones personales.

## Carpetas

Agrupar chats en carpetas propias de J7, parecidas a los proyectos de ChatGPT o Claude. En la primera versión el historial se organiza con búsqueda y chats fijados.

## Importar historial antiguo

Importar las exportaciones oficiales de datos para que los chats antiguos aparezcan en el historial de J7, mezclados con el resto:

- **ChatGPT:** Ajustes → Controles de datos → Exportar datos.
- **Claude:** Ajustes → Privacidad → Exportar datos.
- **Gemini:** Google Takeout (el formato viene más desordenado).

Es una foto del momento: los chats nuevos en esos sitios no aparecen hasta volver a exportar e importar.

## Adjuntar Word y PowerPoint

Extraer el texto de archivos `.docx` y `.pptx` para pasárselo al modelo.

## Conectores

Usar los conectores de claude.ai (Gmail, Drive, Calendar…) desde J7 a través de `claude`.

## Pestañas web de los sitios oficiales

Abrir claude.ai, chatgpt.com y Gemini dentro de J7, con la sesión iniciada, para acceder a sus proyectos y a su historial.

## Conexión por API keys

Agregar un proveedor que use API keys (directo o a través de OpenRouter), por si la velocidad de los programas CLI molesta o para usar modelos que no tienen CLI.
