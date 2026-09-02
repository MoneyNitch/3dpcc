# 3D-PCC (3D-PrintCostCalc)

Local 3D printing cost calculator. It uploads `*.gcode.3mf` files exported by
Bambu Studio or OrcaSlicer, reads material, weight (model, supports, prime
tower and total) and multi-color information, and calculates print costs.

## Features

- Drag-and-drop upload of `.gcode.3mf` files on desktop and mobile
- Automatic analysis of total weight, print time, category weights, filament
  colors and types, and objects on the build plate
- Local SQLite storage for all prints in `data/3d-pcc.db`
- Cost calculator for material, electricity, machine wear, labor, packaging,
  profit margin and tax
- Configurable material prices, printer profiles and cost settings

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

Or use the single command:

```bash
npm run start:production
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
npm run start:production
```

Linux, macOS or Raspberry Pi:

```bash
chmod +x scripts/install.sh
./scripts/install.sh
npm run start:production
```

The scripts check for Node.js 22 or newer and install dependencies. For normal
development, use `npm run dev` afterwards.

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