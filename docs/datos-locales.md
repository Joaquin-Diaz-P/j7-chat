# Dónde guarda J7 los chats y los archivos

J7 conserva el historial en el disco del Mac. La ubicación predeterminada es:

```text
~/Library/Application Support/J7 Chat/
  j7.db                 chats, mensajes, títulos, referencias a adjuntos y sesiones
  j7.db-wal             cambios recientes de SQLite, si la app está abierta
  j7.db-shm             archivo auxiliar de SQLite, si corresponde
  attachments/          copias de los archivos adjuntos
  settings.json         preferencias e instrucciones personales
  providers/            datos de trabajo de los proveedores
  workspace/            carpeta de trabajo aislada de J7
```

Los archivos auxiliares de SQLite no tienen por qué existir cuando J7 está cerrada. `J7_DATA_DIR` permite usar otra ubicación, por ejemplo para pruebas; no es una segunda copia automática del historial.

## Qué se conserva

- Al enviar la primera pregunta, J7 crea el chat en SQLite. Abrir una barra vacía no crea un chat.
- Los mensajes y sus metadatos se guardan en la base de datos; durante una respuesta se guarda el progreso periódicamente.
- Al adjuntar un archivo, J7 crea una copia con identificador propio dentro de `attachments/`. Al enviar el mensaje, guarda en SQLite la relación con esa copia. Mover o borrar el archivo original no rompe el adjunto del chat.
- El texto extraído de documentos se conserva como metadatos del adjunto. Los binarios permanecen en `attachments/`, no dentro de la base de datos.
- Borrar un chat también elimina sus mensajes, sus sesiones y las copias de sus adjuntos. Las copias que se adjuntaron pero nunca se enviaron se limpian después de un día, en un arranque posterior.
- Una respuesta que quedó en curso al cerrar la app se marca como interrumpida al volver a abrir.

Para ver la carpeta, en Finder usa **Ir → Ir a la carpeta…** y pega `~/Library/Application Support/J7 Chat`.

## Guardar no equivale a memoria compartida

Al reabrir una conversación, J7 recupera sus mensajes y puede continuarla. Al cambiar de modelo dentro de ella, entrega el contexto de ese mismo chat que el modelo necesite.

Un chat nuevo no recibe automáticamente los mensajes de otros chats. Las instrucciones personales globales sí se aplican a todos. Las carpetas con contexto compartido quedan como idea futura, no como funcionalidad actual.

El historial local es propio de J7: no se sincroniza con los historiales de los sitios web. Los programas de IA pueden conservar sus propias sesiones según su configuración. Para responder, J7 les entrega la pregunta, el contexto necesario del chat y los adjuntos seleccionados; almacenamiento local no significa inferencia local.

## Copia de seguridad

Cierra J7 y copia **toda la carpeta de datos**, incluidos `j7.db`, `attachments/` y los archivos auxiliares de SQLite si existen. Copiar solo la base de datos omite los documentos e imágenes. Conserva la copia en una ubicación privada porque contiene conversaciones y adjuntos.

Este trabajo no mueve los datos personales existentes. Las verificaciones usan carpetas temporales con modelos simulados.
