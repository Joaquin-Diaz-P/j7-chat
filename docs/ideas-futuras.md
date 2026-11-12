# Ideas y prioridades

Actualizado el 11 de noviembre de 2026 según las decisiones del usuario. El resultado comprobado de cada cambio se registra en [estado.md](estado.md).

## Implementado en 0.1.2

- **Adjuntar Word y PowerPoint:** lectura del texto, las imágenes incrustadas y los datos de los gráficos de `.docx` y `.pptx` mediante el flujo normal de adjuntos, conservando la copia local. No incluye OCR propio (lo hace el modelo con visión) ni reproducción del diseño original.
- **Parche de mantenimiento:** corregidos el inicio de Hex, el intercambio de atajos y los estados y comandos en Ajustes → Conexiones. Eliminada la descripción de micrófono sobrante del empaquetado. Añadido manejo nativo de `⌘ ,` con test automático. Ver el cierre y las verificaciones en `estado.md`.

## Modo council: idea futura

Reemplaza al modo comparar, que se retiró en 0.2.1 porque ver respuestas lado a lado no aportaba lo suficiente. La idea es un «consejo» de modelos que entrega **una sola respuesta mejor**, no varias:

1. La misma pregunta va a dos o tres modelos (por ejemplo Claude, GPT y Gemini).
2. Cada modelo lee las respuestas de los demás, sin saber de quién son, y las critica o las ordena.
3. Un modelo «presidente» combina lo mejor en la respuesta final. Las respuestas intermedias quedan plegadas por si el usuario quiere verlas.

Antes de construirlo hay que definir cuánto gasta (cada pregunta usa varios turnos de cuota), qué modelo preside y cómo se muestra el progreso mientras deliberan.

## Primera prioridad después: OpenRouter

Agregar conexión mediante API key, empezando por OpenRouter. Queda pendiente: **no se implementa ni se pide ninguna clave en este trabajo**. Antes de construirlo, definir almacenamiento de credenciales, selección de modelos, límites y cómo informar el consumo de pago.

## Carpetas con contexto compartido: solo idea futura

Agrupar conversaciones en carpetas propias de J7. La intención del usuario es que un chat nuevo dentro de una carpeta pueda recibir contexto de conversaciones anteriores de esa misma carpeta.

No se construye ahora. Si se retoma, definir qué conversaciones se incluyen, cuánto contexto se entrega, cómo se actualiza y qué controles tiene el usuario para excluir o quitar información. El contexto debe estar limitado a la carpeta; no se propone memoria automática global.

Actualmente el historial usa búsqueda y chats fijados. Guardar chats en disco no hace que los modelos recuerden automáticamente otras conversaciones. Detalles de almacenamiento en [datos-locales.md](datos-locales.md).

## Otras ideas sin fecha

- **Conectores:** investigar acceso a Gmail, Drive, Calendar y otros servicios desde los proveedores, con permisos explícitos. Hoy las herramientas de acceso general siguen bloqueadas.
- **Pestañas de sitios oficiales:** investigar abrir claude.ai, chatgpt.com y Gemini con su sesión dentro de J7. No equivale a importar sus conversaciones al historial local.

## Fuera del alcance por decisión del usuario

- **Importar conversaciones antiguas:** no interesa; no implementar.
- **Memoria automática entre todos los chats:** no es necesaria. Cualquier futura continuidad entre conversaciones se estudiará dentro de carpetas.

## Distribución y verificaciones externas pendientes

- **Notarización de Apple:** la firma local «J7 Chat Local» ya existe; notarizar requiere una cuenta Apple Developer. Mientras tanto, una descarga puede requerir «Abrir igualmente».
- **H.1, salir con ⌘ Q durante transcripción:** prueba física en pausa por petición previa del usuario. No marcar como comprobada por tests de lógica.
- **Permisos:** verificar a mano que conceder un permiso se refleja al volver a J7, cuando se haga la próxima prueba física.
- **⌘ , en la barra:** añadido manejo nativo en el proceso principal y test automático. El fallo físico histórico no se da por cerrado sin una nueva comprobación con teclado real.

## Pendientes antiguos que ya estaban resueltos

- Firma local estable de la app: ver [firma.md](firma.md).
- Rediseño de Ajustes con la estética de la barra (N13).
- Reducción anterior del DMG de aproximadamente 280 MB a 120 MB; no es una medición del paquete nuevo.
- **Zen gratis:** probado físicamente por el usuario con la app firmada el 5 de noviembre; la nota anterior que decía que nunca se había probado quedó obsoleta.
