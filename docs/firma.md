# Firma de la app

macOS recuerda los permisos (Grabación de pantalla, Monitoreo de entrada) por la firma de la app. Si cada versión se firma con una identidad distinta, o ad hoc, macOS los vuelve a pedir después de cada actualización.

Para evitarlo, crea una identidad local estable una sola vez, antes del primer `npm run dist`:

```sh
bash scripts/signing/create-identity.sh
```

El script crea «J7 Chat Local» en el llavero de inicio de sesión y no hace nada si ya existe. Conserva el certificado y su clave: todas las versiones deben firmarse con la misma identidad. `npm run dist` la detecta sola y firma la app (`cl.j7.chat`) y el ayudante (`cl.j7.chat.helper`) antes de crear el DMG. Sin la identidad, firma ad hoc y lo avisa.

Tras reemplazar una versión anterior firmada de otra forma, concede los permisos una vez. Si queda una entrada antigua en Ajustes del Sistema, desactívala y vuelve a activarla.

## Si `codesign` pide acceso a la clave

Cancela esa compilación y abre Acceso a Llaveros → inicio de sesión → Mis certificados → J7 Chat Local → clave privada → Obtener información → Control de acceso, y permite `/usr/bin/codesign`.

En versiones de macOS que exigen la lista de particiones, ejecuta esto en la Terminal (la contraseña se lee oculta y no se guarda):

```sh
read -s 'j7_keychain_password?Contraseña del llavero de inicio de sesión: '; echo
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -l 'J7 Chat Local' -k "$j7_keychain_password" "$HOME/Library/Keychains/login.keychain-db"
unset j7_keychain_password
npm run dist
```

Si la firma dice que el certificado no es confiable: Acceso a Llaveros → J7 Chat Local → Obtener información → Confianza → Firma de código → Confiar siempre. No elimines ni regeneres la identidad al actualizar.

Esta firma local no reemplaza la notarización de Apple: quien descargue el DMG igual tiene que abrirlo con **Abrir igualmente** la primera vez (ver el README).
