# Gemini mediante Antigravity CLI

Validado el 11 de noviembre de 2026 con Antigravity CLI 1.5.6 en macOS Apple Silicon.

J7 conserva el identificador de proveedor `gemini`, pero resuelve el ejecutable `agy` y lo inicia con `agy acp`. Gemini CLI no se usa. La sesión personal existente de Antigravity se recupera del llavero de macOS; no se copian tokens ni se solicita una API key.

## Instalación y uso

Instalar la app de Antigravity no instala automáticamente la CLI. Instalarla con:

```sh
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

En J7, abrir Ajustes → Conexiones y pulsar Iniciar sesión en Gemini si hace falta. El login de Google se realiza por ACP; si la versión instalada no lo admite, se abre `agy` en Terminal. Volver a J7 y elegir Gemini en el selector. El catálogo y los niveles de razonamiento se consultan a la cuenta, sin inventar modelos disponibles. La cuenta usada en la validación devolvió Gemini 3.8 Flash con niveles bajo, medio y alto.

## Alcance

- Texto e imágenes: envío por ACP y respuesta incremental.
- PDF: se envía el texto extraído por J7. Aunque la CLI anuncia `embeddedContext`, la versión 1.5.6 descarta blobs `application/pdf`; no se anuncia soporte nativo para PDF ni para sus páginas escaneadas.
- Conversaciones: `session/load` retoma la sesión después de reiniciar el proceso. Si falta, se informa al servicio de chat para reconstruir el contexto desde el historial de J7.
- Búsqueda web: únicamente `search_web` y `read_url_content`, cuando el usuario activa web.
- El agotamiento de cuota se informa como error de cuota. Los créditos adicionales de pago quedan desactivados en la configuración de J7 (`useG1Credits: false`).

## Aislamiento y datos locales

La configuración, las conversaciones nativas y los logs de la CLI quedan en `~/Library/Application Support/J7 Chat/providers/gemini/`, separados de la configuración global de Antigravity. El workspace de este proveedor también es propio, dentro de esa carpeta, para que su agente no afecte a otros proveedores.

J7 genera un agente principal de chat con una lista explícita de herramientas vacía o solo web. Desactiva customizaciones predeterminadas, no importa hooks, skills, plugins ni MCP del usuario, bloquea archivos y comandos mediante reglas de permisos, y rechaza solicitudes ACP de archivos, terminal y permisos ajenos a búsqueda/consulta web. No cambia las preferencias globales de la app Antigravity.

El inicio de sesión utiliza el llavero compartido por Antigravity. La CLI conserva su historial y registros propios dentro de la carpeta aislada de J7; esos archivos pueden contener texto de las consultas y no se adjuntan a la evidencia de pruebas.

## Verificación realizada

- Estado `ready` y catálogo real de Flash obtenido mediante `session/new.configOptions`.
- Instrucción personal de prueba respetada en una respuesta real.
- Imagen con el número 314 y PDF con el número 271: ambos identificados correctamente tras activar la extracción de texto para PDF.
- Clave sintética recordada después de cerrar el proceso y retomar la misma sesión con razonamiento alto.
- Búsqueda real mediante `search_web`, con notificaciones web traducidas a J7.
- Tests locales con peer ACP simulado: selección de modelo y razonamiento, texto extraído de PDF, falta de autenticación sin abrir OAuth, permisos web por una sola vez, rechazo de ejecución, cancelación y recuperación de sesión perdida.

Fuentes de protocolo: [ACP de Antigravity](https://antigravity.google/docs/ide/extensions/acp), [autenticación](https://antigravity.google/docs/install?tab=cli), [configuración](https://antigravity.google/schemas/v1/settings.json).

## Paquete local

`npm run typecheck` y las 278 pruebas unitarias/de integración pasaron. `npm run dist` generó la app y el DMG 0.1.2 con la integración. La app se instaló en `/Applications/J7 Chat.app`, con firma verificada y `app.asar` idéntico al paquete generado. En ejecución, J7 inició `agy acp` con su directorio aislado y creó la sesión nativa del catálogo.

La automatización de escritorio no pudo inspeccionar la ventana de J7 (la app estaba ejecutándose sin una ventana accesible). La validación de respuestas, adjuntos, continuidad y búsqueda se realizó directamente con el adaptador real; no se atribuye una comprobación visual completa al paquete instalado.
