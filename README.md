<img src="assets/icon.svg" width="64" height="64" alt="">

# J7 Chat

Created in [T3 Code](https://t3.codes).

## Etapa 0

Base Node 24 y TypeScript, sin Electron. Usa las sesiones de los programas instalados; no necesita API keys.

```sh
npm ci
npm run typecheck
npm test
npm run spike -- claude --no-web "Hola"
npm run spike -- codex --list-models
npm run spike -- gemini --status
npm run spike -- opencode --list-models
```

Opciones del spike: `--model`, `--effort normal|high`, `--web`, `--no-web`, `--image`, `--pdf`, `--resume`, `--list-models`, `--status`. También admite `--binary /ruta/absoluta` y `--timeout milisegundos` para diagnóstico. Web viene encendida. El texto se imprime en vivo en stdout; los eventos y tiempos, en gris en stderr. `Ctrl+C` cancela el turno.

Los datos van en `~/Library/Application Support/J7 Chat`; `J7_DATA_DIR` permite cambiar la carpeta. `workspace/` queda vacía. La configuración aislada y las sesiones nativas de Codex, Gemini y OpenCode quedan en `providers/`. Claude conserva su sesión nativa en su propio almacén, bajo el proyecto vacío de J7. Solo se enlazan los archivos de autenticación existentes de Codex y Gemini; no se copian credenciales.

La verificación real es **opcional** y consume cuota:

```sh
swift spikes/create-attachments.swift
npx tsx spikes/verify.ts claude
npx tsx spikes/verify.ts codex
# Ejecutar estos cuando se resuelvan los bloqueos documentados:
npx tsx spikes/verify.ts gemini
npx tsx spikes/verify.ts opencode
```

La matriz usa como máximo diez intentos por programa y se detiene ante errores de autenticación, cuota u opciones no disponibles. `npm test` usa fixtures y procesos simulados locales; no consulta servicios de IA.

Consulta [resultados y comandos de reproducción](docs/etapa-0-resultados.md) y [avisos de terceros](THIRD_PARTY_NOTICES.md). La etapa todavía requiere verificar Gemini con una sesión admitida y Zen con cuota disponible.
