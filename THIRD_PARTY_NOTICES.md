# Referencias y dependencias

- T3 Code, licencia MIT: `.reference/t3code` se consultó para entender los protocolos y el aislamiento. Se adaptaron los tokens de color, radios, sombras y fuentes de `apps/web/src/index.css` en `src/renderer/styles/theme.css` (etapa 1b). La referencia no se modificó ni se incluye en el código de J7.
- Los 63 archivos de `src/main/providers/generated/codex/` son tipos generados por `codex app-server generate-ts --experimental`, versión 0.166.0. Proyecto de origen: [openai/codex](https://github.com/openai/codex), Apache-2.0. Se añadieron extensiones `.js` a los imports para NodeNext y se formatearon. Se regeneran con `npx tsx spikes/generate-codex-types.ts`.
- `@anthropic-ai/claude-agent-sdk` 0.3.318: © Anthropic PBC, todos los derechos reservados; sujeto a sus [acuerdos legales](https://code.claude.com/docs/en/legal-and-compliance). No es una dependencia MIT.
- `@agentclientprotocol/sdk` 2.4.0: Apache-2.0.
- `unpdf` 1.9.1: MIT; incluye PDF.js y sus avisos de licencia.
- `yauzl` 3.4.0: MIT; lectura de archivos ZIP de Word y PowerPoint sin extraerlos al disco.
- `sax` 1.6.1: BlueOak-1.0.0; lectura de XML de documentos Office. Los paquetes de tipos `@types/sax` y `@types/yauzl` son dependencias de desarrollo con licencia MIT.
- Herramientas de desarrollo: TypeScript (Apache-2.0), Vitest y tsx (MIT). Las versiones transitivas y sus avisos se conservan en npm y `package-lock.json`.

Los PNG y PDF de prueba son sintéticos, creados con `spikes/create-attachments.swift`. Los eventos de prueba corresponden a preguntas sintéticas; se eliminaron datos de cuenta, firmas y rutas personales.

Tokens visuales de T3 Code, bajo licencia MIT: https://github.com/pingdotgg/t3code.

## Distribución
Electron (MIT), React y React DOM (MIT), Zustand (MIT), Lucide (ISC), KaTeX (MIT), Shiki (MIT), react-markdown y unified/remark/rehype (MIT), sharp (Apache-2.0; libvips LGPL-2.1-or-later). Los paquetes conservan sus LICENSE y avisos en el archivo de la aplicación; los proveedores externos se instalan por separado. Herramientas de empaquetado: electron-builder (MIT); pruebas: Playwright (Apache-2.0).

## Licencia MIT de T3 Code
MIT License

Copyright (c) 2026 T3 Tools Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
