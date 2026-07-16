# Dalal-al-iraq

Local production and development setup for the Dalal Al Iraq workspace.

## Local production run

1. Build the frontend and API:
   ```sh
   pnpm --filter @workspace/dalal-app run build
   pnpm --filter @workspace/api-server run build
   ```
2. Create or update `.env` with a persistent Postgres data directory:
   ```sh
   PGDATA=/home/you/.local/share/dalal_al_iraq_pgdata
   PGPORT=5433
   DATABASE_URL=postgresql://dalal_user:dalal_password@localhost:5433/dalal_al_iraq
   SESSION_SECRET=replace_with_a_strong_random_secret
   PORT=8080
   ```
3. Run locally:
   ```sh
   source .env
   ./run-local.sh
   ```

The updated `run-local.sh` can now initialize and start a local PostgreSQL cluster from `PGDATA` if needed, using `PGPORT` and `DATABASE_URL`.

## Deployment and domain setup

To deploy `dalalaliraqnetwork.online` on a Linux server:

1. Copy the built frontend and the workspace to the server.
2. Set up a persistent PostgreSQL data directory and the same `DATABASE_URL` on the server.
3. Configure Nginx using `deploy/nginx.conf` and set `server_name dalalaliraqnetwork.online`.
4. Create a systemd service from `deploy/dalal-al-iraq.service` and update the paths/user values to match your server.
5. Point DNS `A` record for `dalalaliraqnetwork.online` to the server public IP.
6. Secure the site with HTTPS (Certbot or other TLS provider) once Nginx is working.

### If your public host is `34.111.179.208`

- The DNS A record for `@` should point to `34.111.179.208`.
- Install Nginx on the server and place `deploy/nginx.conf` in `/etc/nginx/sites-available/dalalaliraqnetwork.online`.
- Enable the site and reload Nginx:
  ```sh
  sudo ln -s /etc/nginx/sites-available/dalalaliraqnetwork.online /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx
  ```
- Use `deploy/dalal-al-iraq.service` to keep the API always running.
- If the server is not the current machine, you must deploy the project to the server at `34.111.179.208` before the domain will work.

This setup keeps the API always available behind Nginx and serves the frontend from the built `dalal-app/dist/public` directory.

## Development workflows

- API server: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- Frontend: `PORT=5000 pnpm --filter @workspace/dalal-app run dev`

## Required environment variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — JWT/session signing secret
- `PORT` — API server port

## Useful commands

- `pnpm run build` — build all packages
- `pnpm run typecheck` — full workspace typecheck
- `pnpm --filter @workspace/db run push` — apply Drizzle schema changes
- `pnpm --filter @workspace/scripts run seed:admin` — create/update admin account
