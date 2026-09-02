# Changelog

## v0.2.0 — Docker support

### Added
- **Docker & Docker Compose support**: the project can now be run as a container.
  - `Dockerfile`: 3-stage build (deps/builder/runner) on `node:22-alpine`, compiles
    the native `better-sqlite3` addon, uses Next.js' `standalone` output for a lean
    production image, runs as a non-root user.
  - `docker-compose.yml`: starts the app with a single command, persists the
    SQLite database via a `./data` volume, optionally supports `DB_DRIVER`/
    `DATABASE_URL` for Postgres/MySQL.
  - `.dockerignore`: excludes `node_modules`, `.next`, `data/`, etc. from the
    build context.
- `next.config.ts`: enabled `output: "standalone"` for smaller production images.
- New `dev:webpack` npm script as a Webpack fallback for the dev server (mirrors
  `build:webpack`), for cases where Turbopack's native bindings are blocked
  locally (e.g. by Windows Smart App Control or antivirus software).

### Fixed
- Resynced `package-lock.json` (missing `@emnapi/*` entries for the optional
  wasm32 variant of `sharp`) so `npm ci` works reliably again.

### Usage
```bash
docker compose up --build -d
```
The app is then available at `http://localhost:3000`; data persists in `./data`.

## v0.1.0 — Initial release
