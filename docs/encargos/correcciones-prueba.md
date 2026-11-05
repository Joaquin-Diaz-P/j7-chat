# Encargo: correcciones tras la prueba física del usuario

Repo: `/Users/joaco/.t3/projects/j7-chat` (rama `desarrollo`). Lee las reglas para los subagentes de `docs/plan.md`.

El usuario instaló la app desde el `.dmg` y la probó a mano. Casi todo funciona, salvo lo de abajo. Los diagnósticos ya están hechos y comprobados; no los repitas.

## 1. Permisos que se pierden en cada compilación (crítico)

**Diagnóstico:**
- La app está firmada ad-hoc, con `Identifier=Electron`, y el ayudante también ad-hoc, con `Identifier=j7-helper`.
- macOS guarda los permisos de una firma ad-hoc atados a su huella (`cdhash`), que cambia con cada compilación.
- Resultado: en Ajustes del Sistema aparece "J7 Chat" activado en Grabación de pantalla, pero `systemPreferences.getMediaAccessStatus("screen")` da `denied` en el proceso principal, y el ayudante también lo ve denegado. Por eso "Captura y pregunta" y "Captura y voz" no funcionan.

**Lo que hay que hacer:** firmar la app con una **identidad estable**, para que los permisos sobrevivan a las recompilaciones.
1. Crea `scripts/signing/create-identity.sh`. Tiene que ser idempotente: si la identidad ya existe, no hace nada.
   - Crea un certificado autofirmado de firma de código, "J7 Chat Local", con `openssl` (`extendedKeyUsage=codeSigning`).
   - Lo importa en el llavero de inicio de sesión con `security import … -T /usr/bin/codesign`, para que `codesign` no pida acceso.
   - Si algún paso necesita que el usuario intervenga (contraseña o confianza), el script lo dice con instrucciones exactas en español.
2. Configura `electron-builder.yml` para firmar con esa identidad.
   - Tanto la app como `Contents/Resources/j7-helper` tienen que firmarse, y el identificador de la app tiene que ser `cl.j7.chat`.
   - Si electron-builder no acepta una identidad no confiable, firma en un `afterSign` o en un script posterior con `codesign --force --deep --sign "J7 Chat Local" --identifier cl.j7.chat`. El ayudante se firma con el identificador `cl.j7.chat.helper`.
3. Comprueba con `codesign -dv` y `codesign -d -r-` que el requisito designado use el certificado (`certificate leaf`) y el identificador, no un `cdhash`.
4. **Prueba que los permisos sobreviven:**
   1. Compila (`npm run dist`) y anota el requisito designado.
   2. Cambia un texto cualquiera.
   3. Vuelve a compilar.
   4. Comprueba que el requisito designado es **idéntico** entre las dos compilaciones.

   No le pidas al usuario que dé permisos durante tu trabajo: él lo hará una sola vez al final.
5. Actualiza el README (K2) con los pasos para crear la identidad la primera vez.

## 2. Zen gratis dice "sin cuota" (crítico)

**Diagnóstico:**
- El usuario tiene sesión iniciada en Zen: su `~/.local/share/opencode/auth.json` tiene una entrada `opencode` de tipo `api`. Con esa sesión, los modelos gratis le funcionan en OpenCode y en T3 Code.
- J7 corre OpenCode con directorios XDG privados y sin esa sesión, así que entra como usuario anónimo, cuyo límite gratis está agotado.

**Lo que hay que hacer:**
- Haz que el OpenCode de J7 use la sesión de Zen del usuario, igual que Codex usa un enlace a su `auth.json` (`linkExisting` en `runtime.ts`). Enlaza el `auth.json` real en el directorio de datos privado de OpenCode; **no copies secretos**.
- El catálogo tiene que seguir mostrando **solo** los modelos gratis del proveedor `opencode`, aunque el `auth.json` tenga otros proveedores (`openai`, `openrouter`, `opencode-go`). No puede quedar ningún camino para usar un modelo de pago.
- Agrega un test que confirme que, con un `auth.json` de varios proveedores, el catálogo sigue mostrando solo los gratis de `opencode`.
- **Prueba real permitida** (los modelos gratis no gastan cuota pagada): un turno con `npm run spike -- opencode --model deepseek-v4.1-flash-free --no-web 'Responde solo: ok'`. Tiene que responder. Si da error de cuota, investiga si la sesión llegó realmente al proceso.

## 3. Procesos de OpenCode huérfanos

Quedaron procesos `opencode serve --hostname 127.0.0.1 --port …` de pruebas anteriores, que no se cerraron cuando su J7 murió.
- J7 tiene que guardar el PID de su servidor en `{datos}/providers/opencode.pid`.
- Al arrancar, si ese PID sigue vivo y su línea de comandos es `opencode serve --hostname 127.0.0.1`, lo cierra.
- **Nunca cierres otros procesos de OpenCode**, como `opencode serve --service` (es de Hex) o los de T3 Code.
- Agrega un test.

## 4. Detalles

1. **Mensajes duplicados:** cuando falta el permiso de pantalla, la barra muestra la tarjeta de permiso **y además** "No se pudo completar la captura o iniciar Hex…". Si falta un permiso, solo tiene que aparecer la tarjeta.
2. **`⌘ ,` en la barra no abre los ajustes con el teclado real** del usuario, que tiene distribución en español. Con eventos sintéticos sí funcionaba.
   - Revisa cómo se detecta: usa `event.code === "Comma"` además de `event.key`, y comprueba que el `keydown` llegue cuando el foco está en el campo de texto.
   - Si algún elemento intercepta el evento antes, corrígelo.
   - Agrega un test de la función que decide el atajo.

## Al terminar

- `npm run typecheck` y `npm test` pasan, `npm run build:helper` pasa y `npm run dist` genera el `.dmg` firmado con la identidad estable.
- No instales en `/Applications`.
- Sin commits ni push; no toques `docs/` salvo el README.
- Reporte breve con:
  - Qué se hizo en cada punto.
  - Los requisitos designados de las dos compilaciones.
  - El resultado del turno de Zen.
  - Archivos.
  - Comandos ejecutados y su resultado.
  - Lo que tiene que hacer el usuario: una lista corta.
