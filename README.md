# 3D-PCC (3D-PrintCostCalc)

Local 3D printing cost calculator. It uploads `*.gcode.3mf` files exported by
Bambu Studio or OrcaSlicer, reads material, weight (model, supports, prime
tower and total) and multi-color information, and calculates print costs.

> Important Note: This project is not intended for use on the public network and may pose a risk. Please use it only on a private network at this time.

> This project is a hobby project and is currently in Early Access. It is still
> under active development, so errors, missing features, or incomplete
> functionality may occur. Feedback and suggestions are welcome. This is my first open-source project, and I also plan to program a large part of it using AI, since I wanted to test it out. 

## Features

- Drag-and-drop upload of `.gcode.3mf` files on desktop and mobile
- Automatic analysis of total weight, print time, category weights, filament
  colors and types, and objects on the build plate
- Local SQLite storage for all prints in `data/3d-pcc.db`
- Cost calculator for material, electricity, machine wear, labor, packaging,
  profit margin and tax
- Configurable material prices, printer profiles and cost settings

## Roadmap

- Use projects from BambuStudio and OrcaSlicer for calculations.
- Manual entry of 3D prints.
- And more.

> I’d be happy to receive any suggestions.

## Requirements

- **Node.js >= 22**. This is required by `better-sqlite3`; older versions can
  cause `SIGSEGV` crashes because of native Node ABI incompatibilities.

## Usage

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Access from a mobile device

The development server also shows a network address such as
`http://192.168.x.x:3000`. Open that address on a phone connected to the same
Wi-Fi network.

### Production

```bash
npm run build
npm run start
```

For a background live environment, use:

```bash
npm run build
npm run start:background
```

Or use the single command:

```bash
npm run start:production:background
```

On first startup, `data/3d-pcc.db` and the local database configuration are
created automatically when needed. These files contain prints, settings and
invoice data and are intentionally excluded from the repository by
`.gitignore`.

### Installation scripts

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install.ps1
.\scripts\install.ps1 -Background
npm run start:production
```

Linux, macOS or Raspberry Pi:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
./scripts/install.sh --background
npm run start:production
```

The scripts check for Node.js 22 or newer and install dependencies. Use the
`-Background` or `--background` option if you want the app to keep running in
the background after the terminal is closed. For normal development, use
`npm run dev` afterwards.

## Docker

The app can also be run as a container, without installing Node.js locally.

```bash
docker compose up --build -d
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database,
`db-config.json` and the encryption key persist across restarts in the local
`./data` folder, which is mounted as a volume.

Stop the container:

```bash
docker compose down
```

To use a different port, set `PORT` before starting (or in a `.env` file next
to `docker-compose.yml`):

```powershell
$env:PORT=8080; docker compose up --build -d
```

To connect to Postgres or MySQL/MariaDB instead of SQLite, set `DB_DRIVER` and
`DATABASE_URL` the same way (see [Database backends](#database-backends)
below), or configure the connection later from the app's Settings page.

Without Compose, plain Docker also works:

```bash
docker build -t 3d-pcc .
docker run -d -p 3000:3000 -v ./data:/app/data --name 3d-pcc 3d-pcc
```

On Linux hosts, the container runs as a non-root user (uid 1001); if `./data`
already exists and is owned by root (e.g. created via `sudo docker compose
up`), grant it write access first:

```bash
sudo chown -R 1001:1001 ./data
```

### Changing the port

The default port is 3000. To use another port, copy `.env.example` to
`.env.local` and set `PORT=xxxx`. This applies to both `npm run dev` and
`npm run start`. In a live hosting environment, use the port supplied by the
hosting provider instead of committing a fixed port.

### Raspberry Pi / ARM troubleshooting

Check the Node.js version with `node -v`; it must be >= 22. If necessary,
install a current version before troubleshooting `better-sqlite3`:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should show v22.x
```

After copying the project to a Raspberry Pi or another ARM device, always
remove `node_modules` and `.next` and reinstall/build locally. Native binaries
and Next.js build tools are platform-specific:

```bash
rm -rf node_modules .next
npm install
npm run build
npm run start
```

If the build still crashes with `SIGSEGV` during `Collecting page data`, use
the Webpack fallback:

```bash
npm run build:webpack
npm run start
```

On devices with little RAM, check `free -h` and increase swap if necessary.

## Database backends

SQLite is used by default (`data/3d-pcc.db`). PostgreSQL and MariaDB/MySQL are
also supported. Copy `.env.example` to `.env.local` and configure it:

```bash
# DB_DRIVER: sqlite (default) | postgres | mysql (also MariaDB)
DB_DRIVER=sqlite

# Required for postgres/mysql only:
# DATABASE_URL=postgres://user:password@localhost:5432/3dpcc
# DATABASE_URL=mysql://user:password@localhost:3306/3dpcc
```

Required tables are created automatically on first startup. Restart the
development or production server after changing `.env.local`.

The database can also be configured in **Settings > Database** without a
server restart. The connection is tested before saving. The password is
encrypted in `data/db-config.json`, with the key stored in `data/.dbkey`; both
files are local and excluded from Git.
