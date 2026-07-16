#!/usr/bin/env bash
set -euo pipefail

# This script is intended to run on the target server where
# dalalaliraqnetwork.online is hosted.
# It prepares the project, enables systemd, and configures Nginx.

DOMAIN=${DOMAIN:-dalalaliraqnetwork.online}
DEPLOY_DIR=${DEPLOY_DIR:-/var/www/dalal-al-iraq}
SERVICE_NAME=${SERVICE_NAME:-dalal-al-iraq}
PGDATA=${PGDATA:-/var/lib/dalal_al_iraq_pgdata}
PGPORT=${PGPORT:-5433}
DB_USER=${DB_USER:-dalal_user}
DB_PASSWORD=${DB_PASSWORD:-dalal_password}
DB_NAME=${DB_NAME:-dalal_al_iraq}
PORT=${PORT:-8080}

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root or with sudo."
  exit 1
fi

echo "Deploying Dalal Al Iraq to $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
chown -R "$SUDO_USER" "$DEPLOY_DIR" 2>/dev/null || true

cat <<EOF > "$DEPLOY_DIR/.env"
PGDATA=$PGDATA
PGPORT=$PGPORT
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:$PGPORT/$DB_NAME
SESSION_SECRET=$(openssl rand -hex 32)
PORT=$PORT
EOF

echo "Created env file at $DEPLOY_DIR/.env"

echo "Ensure the repository is copied into $DEPLOY_DIR and that Node.js, pnpm, PostgreSQL, and Nginx are installed."

echo "Next steps:"
echo "  1. cd $DEPLOY_DIR"
echo "  2. pnpm install"
echo "  3. pnpm --filter @workspace/dalal-app run build"
echo "  4. pnpm --filter @workspace/api-server run build"
echo "  5. cp deploy/nginx.conf /etc/nginx/sites-available/$DOMAIN"
echo "  6. ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN"
echo "  7. nginx -t && systemctl reload nginx"
echo "  8. cp deploy/dalal-al-iraq.service /etc/systemd/system/$SERVICE_NAME.service"
echo "  9. systemctl daemon-reload"
echo " 10. systemctl enable --now $SERVICE_NAME.service"
e
echo "To install HTTPS with Certbot:"
echo "  certbot --nginx -d $DOMAIN"
