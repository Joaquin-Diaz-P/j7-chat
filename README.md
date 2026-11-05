# J7 Chat

Barra personal de consultas rápidas para macOS Apple Silicon (macOS 14 o posterior). Usa las sesiones de Claude, Codex y OpenCode instalados en el Mac. Hex se usa para dictado y se instala por separado: `brew install --cask anomalyco/tap/hex`, según su [README oficial](https://github.com/anomalyco/hex/blob/dev/README.md).

Abre el DMG de `release/` y copia **J7 Chat.app** a Aplicaciones para instalarla. La primera vez usa clic derecho → Abrir. La distribución es local, sin firma ni notarización. Durante el desarrollo también puedes abrir `release/J7 Chat.app` directamente.

`⌥ J` abre la barra; `⌥ ⇧ J` captura y adjunta; mantener Opción derecha captura y dicta con Hex. `⌘ ,` o el menú de la barra abren Ajustes. Allí puedes cambiar tema, arranque al iniciar sesión, atajos, modelo y favoritos e instrucciones personales. Los cambios se guardan automáticamente.

En Ajustes → Permisos concede **Grabación de pantalla** y **Monitoreo de entrada** usando los botones para abrir Ajustes del Sistema. Si macOS lo pide, reinicia J7 después. Hex gestiona su propio permiso de micrófono. Ajustes → Programas muestra el estado y comandos de instalación y sesión. Evita usar la misma tecla para Hex y J7.

Los datos están en `~/Library/Application Support/J7 Chat`: `settings.json`, `j7.db`, adjuntos y entornos privados de los proveedores. Para actualizar, cierra J7 y reemplaza la app con la versión nueva; los datos se conservan. No borres la carpeta de datos para actualizar.

## Desarrollo

Requiere Node 24+, Xcode Command Line Tools y macOS arm64. Ejecuta `npm ci`, `npm run dev`. `npm run build:helper` compila el ayudante Swift; `npm run build` genera el bundle e iconos; `npm run dist` genera `release/J7 Chat.app` y el DMG arm64 sin firma. `npm run typecheck`, `npm test` y `npm run test:e2e` verifican tipos, unidades y un recorrido Electron con Playwright y proveedores mock. `J7_DATA_DIR` permite datos aislados, `J7_MOCK=1` evita inferencia real. El gancho de mostrar la barra solo existe con `J7_TEST=1`.

## Comprobación manual después de instalar

1. Abre la app con clic derecho → Abrir; comprueba que el aviso inicial aparece una sola vez.
2. Concede ambos permisos, abre la barra desde otra app y prueba captura.
3. Cambia cada atajo y verifica el nuevo y que el anterior se libere; comprueba aviso si Hex usa la misma tecla.
4. Revisa programas y modelos; envía una pregunta breve, adjunta un archivo y vuelve al chat desde el historial.
5. Prueba Hex con una frase, solo cuando quieras usar dictado.
6. Cambia instrucciones personales y comprueba el siguiente turno del mismo chat.
7. Cierra sesión y vuelve a entrar para comprobar el inicio automático; desactívalo en General y repite.

Ver `THIRD_PARTY_NOTICES.md` para licencias y referencias.
