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

J7 no tiene modelos ni cuentas propias. Usa los programas de IA que ya tienes instalados y con sesión iniciada en tu Mac (Claude Code, Codex u OpenCode), así que responde con tu suscripción y no pide claves de API.

> Requiere un Mac con Apple Silicon (M1 o posterior) y macOS 14 o más nuevo.

## Funciona mejor con

J7 funciona con cualquiera de estos programas y aprovecha todos los que encuentre:

| Programa | Para qué | Cómo instalarlo |
| --- | --- | --- |
| [Claude Code](https://claude.com/claude-code) | Modelos de Claude (Opus, Sonnet, Haiku…) | `curl -fsSL https://claude.ai/install.sh \| bash`, luego `claude auth login` |
| [Codex](https://github.com/openai/codex) | Modelos de OpenAI con tu cuenta de ChatGPT | `npm install -g @openai/codex`, luego `codex login` |
| [OpenCode](https://opencode.ai) | Otros modelos, incluidos algunos gratis | `curl -fsSL https://opencode.ai/install \| bash`, luego `opencode auth login` |
| [Hex](https://github.com/anomalyco/hex) | Dictado por voz, local y privado | `brew install --cask anomalyco/tap/hex` |

Necesitas al menos uno de los tres primeros. Hex es opcional: sin Hex, J7 funciona igual, pero sin voz. En **Ajustes → Programas** ves cuáles detectó J7 y qué comando falta.

## Instalar

1. Descarga el DMG de la última versión en [Releases](../../releases).
2. Ábrelo y arrastra **J7 Chat** a Aplicaciones.
3. La primera vez, macOS la bloquea porque no está notarizada por Apple. Ábrela una vez y luego ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**. También puedes quitarle la marca de descarga desde la Terminal:
   ```sh
   xattr -dr com.apple.quarantine "/Applications/J7 Chat.app"
   ```
4. En **Ajustes de J7 → Permisos**, concede **Grabación de pantalla** (para las capturas) y **Monitoreo de entrada** (para la tecla de voz). Si macOS lo pide, reinicia J7.

J7 vive en la barra de menús, no en el Dock.

## Cómo se usa

| Atajo | Qué hace |
| --- | --- |
| `⌥ Espacio` | Abre o cierra la barra |
| `⌥ ⇧ J` | Captura una zona de la pantalla y la adjunta a tu pregunta |
| Mantener `⌥` derecha | Captura la pantalla y dicta con Hex mientras la mantienes; al soltar, envía |
| Doble toque en `⌥` derecha | Igual, pero sigue grabando sin mantener la tecla; `Enter` u otro toque envía |
| `⌘ ,` | Ajustes |

Los atajos se cambian en **Ajustes → Atajos**. Si Hex usa la misma tecla que J7, el ajuste te avisa.

Para adjuntar archivos, arrástralos a la barra o usa el clip. J7 lee imágenes, PDF y texto.

Tus chats, ajustes y adjuntos se guardan solo en tu Mac, en `~/Library/Application Support/J7 Chat`. Para actualizar, cierra J7 y reemplaza la app por la nueva; tus datos se conservan.

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

[MIT](LICENSE). Las licencias de las dependencias y referencias están en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). J7 Chat no está afiliado a Anthropic, OpenAI, OpenCode ni Hex.
