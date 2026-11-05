# Origen de las muestras

Capturadas el 4 de noviembre de 2026, macOS Apple Silicon, Node 24.11.1:

- `claude-events.json`: Claude 2.1.309, Haiku 5.5, diez turnos de la matriz. La captura precede a la desactivación explícita de los tres plugins internos: los inventarios finales vacíos están en `docs/evidence/claude-isolation.json` y `claude-final-check.json`.
- `codex-events.json`: Codex 0.166.0, GPT-6-Luna, diez turnos. Incluye la respuesta real `webSearch.results` con URLs.
- `gemini-events.json`: Gemini 0.46.0. Inicialización ACP real y errores RPC reales de rechazo de Code Assist individual. No hay deltas de inferencia reales: los tests de esos deltas están identificados como sintéticos.
- `opencode-events.json`: OpenCode 2.2.5, DeepSeek V4.1 Flash Free. Inicio y rechazo SSE reales, `provider.free-limit`, HTTP 429. No hay respuestas de inferencia reales: los tests de deltas y herramientas están identificados como sintéticos.
- `attachments/`: PNG con «J7 42» y PDF de 30 páginas con «El faro violeta cuenta 47 estrellas.», generados con `swift spikes/create-attachments.swift`. Primera página del PDF renderizada con Poppler y verificada visualmente.

`spikes/verify.ts` proyecta solamente mensajes útiles para las traducciones y elimina campos de credenciales, cuentas, correos y firmas; sustituye el directorio personal y UUID. Los tests de red nunca se ejecutan mediante `npm test`. `runtime.test.ts` y `gemini-runtime.test.ts` usan programas locales simulados y credenciales vacías, sin servicios externos.
