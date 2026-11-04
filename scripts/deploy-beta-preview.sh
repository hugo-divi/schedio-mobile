#!/usr/bin/env bash
# Publica la web en un canal de vista previa de Firebase Hosting: una URL
# aparte (schedio-b3958--beta-XXXX.web.app) que solo conoce quien la tenga.
# app.schedio.es NO cambia: ahí sigue lo que haya publicado.
#
#   npm run deploy:beta-preview
#
# Necesita .env.local con los valores reales (los mismos que usas para
# publicar) y haber hecho `firebase login`. Ver docs/PRUEBAS-BETA.md.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "Falta .env.local (copia .env.example y rellena los valores reales)." >&2
  exit 1
fi

CHANNEL="${1:-beta}"
EXPIRES="${EXPIRES:-30d}"

echo "→ Compilando la web…"
npx expo export --platform web --clear

echo "→ Publicando en el canal '$CHANNEL' (caduca en $EXPIRES)…"
npx firebase hosting:channel:deploy "$CHANNEL" --expires "$EXPIRES" --project schedio-b3958

cat <<'EOF'

Hecho. Antes de abrirla en el iPhone:
  1. Firebase Console → Authentication → Settings → Dominios autorizados:
     añade el dominio de la URL de arriba (sin https://). Sin esto, el login
     falla en esa URL.
  2. Sigue docs/PRUEBAS-BETA.md.
EOF
