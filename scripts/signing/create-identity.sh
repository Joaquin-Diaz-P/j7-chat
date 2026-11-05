#!/bin/bash
set -euo pipefail
if security find-certificate -c 'J7 Chat Local' >/dev/null 2>&1; then
  echo 'La identidad J7 Chat Local ya existe; no se modifica.'
  exit 0
fi
keychain="$HOME/Library/Keychains/login.keychain-db"
work=$(mktemp -d)
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT
umask 077
openssl req -new -newkey rsa:2048 -nodes -x509 -days 3650 \
  -subj '/CN=J7 Chat Local/' -addext 'extendedKeyUsage=codeSigning' \
  -addext 'keyUsage=digitalSignature' -addext 'basicConstraints=critical,CA:FALSE' \
  -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" \
  -out "$work/identity.p12" -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -passout pass:j7-local-import
if ! security import "$work/identity.p12" -k "$keychain" -P j7-local-import -T /usr/bin/codesign; then
  echo 'Abre Acceso a Llaveros, desbloquea el llavero «inicio de sesión» y vuelve a ejecutar bash scripts/signing/create-identity.sh.' >&2
  exit 1
fi
echo 'Identidad creada. Conserva este certificado y su clave en el llavero para futuras compilaciones.'
