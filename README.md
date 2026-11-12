<p align="center">
  <img src="assets/icon.svg" width="96" alt="">
</p>

<h1 align="center">J7 Chat</h1>

<p align="center">
  Una barra de consultas rápidas para macOS. Aprietas un atajo desde cualquier app, preguntas y sigues trabajando.<br>
  Puedes adjuntar una captura de la pantalla o archivos, y dictar con la voz.
</p>

<p align="center">
  <a href="../../releases/latest"><img src="https://img.shields.io/github/v/release/Joaquin-Diaz-P/j7-chat?label=descargar&color=4f46e5" alt="Descargar"></a>
  <img src="https://img.shields.io/badge/macOS-14%2B%20%C2%B7%20Apple%20Silicon-111" alt="macOS 14+ · Apple Silicon">
  <a href="../../actions/workflows/ci.yml"><img src="https://github.com/Joaquin-Diaz-P/j7-chat/actions/workflows/ci.yml/badge.svg" alt="Pruebas"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-MIT-green" alt="Licencia MIT"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/j7-oscuro.png">
    <img src="docs/images/j7-claro.png" width="460" alt="J7 Chat respondiendo una pregunta sobre CSS, con bloques de código resaltados">
  </picture>
</p>

J7 no tiene modelos ni cuentas propias. Usa los programas de IA que ya tienes instalados y con sesión iniciada en tu Mac (Claude Code, Codex o Antigravity CLI), así que responde con tu suscripción y no pide claves de API.

> Requiere un Mac con Apple Silicon (M1 o posterior) y macOS 14 o más nuevo.

## Funciona mejor con

| Programa | Para qué | Descarga |
| --- | --- | --- |
| [Claude Code](https://code.claude.com/docs/en/setup) | Modelos de Claude (Opus, Sonnet, Haiku…) con tu cuenta de Claude | `curl -fsSL https://claude.ai/install.sh \| bash` |
| [Codex](https://developers.openai.com/codex/cli) | Modelos de OpenAI con tu cuenta de ChatGPT | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| [Antigravity CLI](https://antigravity.google/docs/getting-started) | Modelos de Gemini con tu cuenta de Google | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |
| [Hex](https://github.com/anomalyco/hex) | Dictado por voz, local y privado (opcional) | [Descargar DMG](https://anoma.ly/hex/download/macos-arm64-dmg) · requiere macOS 15 |

Necesitas al menos uno: Claude Code, Codex o Antigravity CLI. Hex es opcional: sin Hex, J7 funciona igual, pero sin voz (no aparece el botón del micrófono y `⌥` derecho no hace nada en J7). Si lo instalas después, la voz se activa sola. J7 también aprovecha [OpenCode](https://opencode.ai) si ya lo tienes.

## Instalar paso a paso

**1. Instala J7**

1. Descarga el DMG de la última versión en [Releases](../../releases/latest).
2. Ábrelo y arrastra **J7 Chat** a Aplicaciones.
3. La primera vez, macOS la bloquea porque no está notarizada por Apple. Ábrela una vez y luego ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**. También puedes quitarle la marca de descarga desde la Terminal:
   ```sh
   xattr -dr com.apple.quarantine "/Applications/J7 Chat.app"
   ```

J7 tiene un ícono en la barra de menús y también aparece en el Dock.

**2. Conecta tu cuenta de Claude, ChatGPT o Google**

Si falta una conexión, J7 abre **Ajustes → Conexiones**. Cada tarjeta muestra el estado, la versión y, cuando el servicio los proporciona, la cuenta y el plan.

1. Si falta el programa, pulsa **Descargar** para abrir su página oficial. También puedes desplegar **Instalar desde la Terminal** y copiar el comando. El enlace **Sitio oficial** está siempre disponible.
2. Pulsa **Iniciar sesión** en J7: Claude, ChatGPT y Gemini abren el navegador con el programa oficial. Vuelve al terminar; J7 detecta la sesión automáticamente. Puedes reabrir el enlace, cancelar o enviar un código si Claude lo solicita. OpenCode abre su login en Terminal; Gemini también usa Terminal si la versión instalada no ofrece login de Google por ACP.
3. Usa **Ver modelos** para consultar el catálogo o el interruptor para ocultar un servicio. Siempre debe quedar al menos un servicio activo con sesión. **Cerrar sesión**, disponible para Claude y Codex, pide confirmación porque afecta también al programa oficial y a las otras apps que comparten su sesión.

Para Gemini necesitas Antigravity CLI; la app de Antigravity por sí sola no instala `agy`. J7 reutiliza la sesión local y no activa créditos de pago al agotar la cuota. Hex se encuentra en **Voz**, al final de Conexiones.

**3. Da los permisos**

En **Ajustes → Permisos**, cada permiso tiene un botón que abre la página exacta de Ajustes del Sistema:

| A quién | Permiso | Para qué |
| --- | --- | --- |
| J7 Chat | Grabación de pantalla | Las capturas |
| J7 Chat | Monitoreo de entrada | La tecla de voz |
| J7 Chat | Micrófono (opcional) | Que la onda siga tu voz al dictar. J7 solo mide el volumen; no graba ni guarda audio |
| Hex | Micrófono | Escucharte |
| Hex | Accesibilidad | Dictar |

Los de Hex se le dan a **Hex**, no a J7: en la lista de Ajustes del Sistema, activa Hex. Claude Code y Codex no necesitan permisos. Si macOS lo pide, usa **Reiniciar J7**.

**4. Voz (opcional)**

Descarga [Hex](https://anoma.ly/hex/download/macos-arm64-dmg), ábrelo una vez y sigue sus pasos (descarga el modelo de voz). Después, mantén `⌥` derecho en cualquier app para dictarle a J7. Mientras dictas, la barra de J7 muestra una onda que sigue tu voz y J7 oculta el visor de Hex, que vuelve a su lugar al terminar. La primera vez, macOS pregunta si J7 puede usar el micrófono: solo mide el volumen para la onda; si no lo permites, la onda se anima igual.

## Cómo se usa

| Atajo | Qué hace |
| --- | --- |
| `⌥ Espacio` | Abre o cierra la barra |
| `⌥ ⇧ J` | Captura una zona de la pantalla y la adjunta a tu pregunta |
| Mantener `⌥` derecha | Captura la pantalla y dicta con Hex mientras la mantienes; al soltar, envía |
| Doble toque en `⌥` derecha | Igual, pero sigue grabando sin mantener la tecla; `Enter` u otro toque envía |
| `⌘ ,` | Ajustes |

Los atajos se cambian en **Ajustes → Atajos**. Si Hex usa la misma tecla que J7, el ajuste te avisa.

Para adjuntar archivos, arrástralos a la barra o usa el clip. J7 lee imágenes, PDF, texto, Word (`.docx`) y PowerPoint (`.pptx`). En Word y PowerPoint envía el texto, los datos de los gráficos como tablas y las imágenes incrustadas (a los modelos que ven imágenes); no reproduce el diseño.

Tus chats, ajustes y adjuntos se guardan en tu Mac, en `~/Library/Application Support/J7 Chat`: el historial está en `j7.db` y las copias de archivos, en `attachments/`. Un chat nuevo no recibe contexto de otros chats. [Dónde se guarda cada dato y cómo respaldarlo](docs/datos-locales.md). Para actualizar, cierra J7 y reemplaza la app por la nueva; tus datos se conservan.

## Compilarla tú

Necesitas Node 24 o más nuevo y las herramientas de línea de comandos de Xcode (`xcode-select --install`).

```sh
git clone https://github.com/Joaquin-Diaz-P/j7-chat.git
cd j7-chat
npm ci
npm run dev    # abre J7 en modo desarrollo
npm run dist   # crea release/J7 Chat.app y el DMG
```

`npm run dist` firma la app ad hoc si no tienes una identidad de firma. Así funciona, pero macOS vuelve a pedir los permisos después de cada actualización. Para evitarlo, crea una identidad local una sola vez con `bash scripts/signing/create-identity.sh` (detalles en [docs/firma.md](docs/firma.md)).

## Colaborar

Las ideas, los reportes de errores y los pull requests son bienvenidos. Lee [CONTRIBUTING.md](CONTRIBUTING.md) para ver cómo está organizado el código y cómo probar tus cambios.

## Licencia

[MIT](LICENSE). Las licencias de las dependencias y referencias están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). J7 Chat no está afiliado a Anthropic, OpenAI, Google, OpenCode ni Hex. Sus logos son marcas de sus dueños y solo identifican cada servicio.
