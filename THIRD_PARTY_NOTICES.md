# Referencias y dependencias

- T3 Code, licencia MIT: `.reference/t3code` se consultó para entender los protocolos y el aislamiento. Se adaptaron los tokens de color, radios, sombras y fuentes de `apps/web/src/index.css` en `src/renderer/styles/theme.css` (etapa 1b). La referencia no se modificó ni se incluye en el código de J7.
- Los 63 archivos de `src/main/providers/generated/codex/` son tipos generados por `codex app-server generate-ts --experimental`, versión 0.166.0. Proyecto de origen: [openai/codex](https://github.com/openai/codex), Apache-2.0. Se añadieron extensiones `.js` a los imports para NodeNext y se formatearon. Se regeneran con `npx tsx spikes/generate-codex-types.ts`.
- `@anthropic-ai/claude-agent-sdk` 0.3.318: © Anthropic PBC, todos los derechos reservados; sujeto a sus [acuerdos legales](https://code.claude.com/docs/en/legal-and-compliance). No es una dependencia MIT.
- `@agentclientprotocol/sdk` 2.4.0: Apache-2.0.
- `unpdf` 1.9.1: MIT; incluye PDF.js y sus avisos de licencia.
- Herramientas de desarrollo: TypeScript (Apache-2.0), Vitest y tsx (MIT). Las versiones transitivas y sus avisos se conservan en npm y `package-lock.json`.

Los PNG y PDF de prueba son sintéticos, creados con `spikes/create-attachments.swift`. Los eventos de prueba corresponden a preguntas sintéticas; se eliminaron datos de cuenta, firmas y rutas personales.

Tokens visuales de T3 Code, bajo licencia MIT: https://github.com/pingdotgg/t3code.
