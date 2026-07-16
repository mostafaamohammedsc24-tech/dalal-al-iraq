# Dalal Al Iraq Deployment Guide

This directory contains deployment support files to host `dalalaliraqnetwork.online`.

## What to deploy on your server

- `dalal-app/dist/public` — built frontend assets
- `api-server/dist` — compiled backend
- `run-local.sh` — production startup script
- `deploy/dalal-al-iraq.service` — systemd service template
- `deploy/nginx.conf` — Nginx reverse proxy template

## Recommended server configuration

1. Use a Linux server with public IP `169.224.9.146`.
2. Install Node.js 26+, pnpm, PostgreSQL, and Nginx.
3. Clone or copy this repository to the server.
4. Create a `.env` file in the repo root with values:
   ```sh
   PGDATA=/var/lib/dalal_al_iraq_pgdata
   PGPORT=5433
   DATABASE_URL=postgresql://dalal_user:dalal_password@localhost:5433/dalal_al_iraq
   SESSION_SECRET=replace_with_a_strong_random_secret
   PORT=8080
   ```
5. Build the app:
   ```sh
   pnpm install
   pnpm --filter @workspace/dalal-app run build
   pnpm --filter @workspace/api-server run build
   ```
6. Test locally on the server:
   ```sh
   source .env
   ./run-local.sh
   ```
7. Configure Nginx with `deploy/nginx.conf`, update the path, and enable the site.
8. Use `deploy/dalal-al-iraq.service` as the systemd service.

## systemd setup example

```sh
sudo cp deploy/dalal-al-iraq.service /etc/systemd/system/dalal-al-iraq.service
sudo systemctl daemon-reload
sudo systemctl enable --now dalal-al-iraq.service
```

## Nginx setup example

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dalalaliraqnetwork.online
sudo ln -s /etc/nginx/sites-available/dalalaliraqnetwork.online /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL

Install HTTPS with Certbot:

```sh
sudo certbot --nginx -d dalalaliraqnetwork.online
```

## Notes

- The domain must resolve to the public IP of the host server.
- If the server at `34.111.179.208` is separate from this machine, deploy the project there.
- This repo is ready to run once the host machine has the source and environment configured.
