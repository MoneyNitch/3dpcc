# 3D-PCC (3D-PrintCostCalc)

Local 3D printing cost calculator. It uploads `*.gcode.3mf` files exported by
Bambu Studio or OrcaSlicer, reads material, weight (model, supports, prime
tower and total) and multi-color information, and calculates print costs.

> Important Note: This project is not intended for use on the public network and may pose a risk. Please use it only on a private network at this time.

> This project is a hobby project and is currently in Early Access. It is still
> under active development, so errors, missing features, or incomplete
> functionality may occur. Feedback and suggestions are welcome. This is my first open-source project, and I also plan to program a large part of it using AI, since I wanted to test it out. 

## Screenshots

### Print overview

![3D-PCC print overview showing the upload area and saved prints](./img/home.png)

### Print details and cost calculator

![3D-PCC print details with the interactive preview and cost calculator](./img/costcalc.png)

## Features

- Drag-and-drop upload of `.gcode.3mf` files on desktop and mobile
- Automatic analysis of total weight, print time, category weights, filament
  colors and types, and objects on the build plate
- Multi-plate 3MF projects show each plate's data and 2D/3D preview; all plates
  can also be selected for total project costs or created as individual saved
  prints after confirmation, and added as separate invoice/quote items
- Local SQLite storage for all prints in `data/3d-pcc.db`
- Cost calculator for material, electricity, machine wear, labor, packaging,
  profit margin and tax
- Configurable material prices, printer profiles and cost settings
- Company sender details for invoice and quote templates are configured under
  **Settings → General**
- Read-only Spoolman and FilaMan System connections with per-filament spool
  selection in the cost calculator
- Interactive 3D preview: embedded model meshes when available, otherwise a
  complete G-code toolpath preview (including XY arcs), rendered using WebGL2
  as solid filament strands with slicer-provided widths and layer heights.
  No depositing segments are sampled or dropped. Toolpaths are not the original
  surface model and cannot exactly reproduce the slicer's thumbnail.
  Each sliced plate has its own G-code preview; travel and custom machine
  routines are excluded. Re-upload older prints to generate per-plate previews.
  Disable **Enable 3D preview** under **Settings > General** to show only 2D
  images and skip generating 3D data on new uploads. Existing preview data is
  retained. Prints uploaded while disabled require another upload for 3D after
  re-enabling the setting.

### Background 3D calculation on slower systems

Uploads save the print and queue its 3D preview instead of calculating it in the
request. One background worker processes the queue sequentially, without reducing
toolpath detail. Print costs and the 2D thumbnail remain usable while it runs.
The 3D tab shows the pending calculation and automatically loads the result.
Failed jobs show a retry button.
**Settings > Queue** lists waiting, processing, failed and unsupported jobs and
refreshes automatically. Move waiting jobs up or down to change their persistent
execution order; the active job cannot be reordered. Removing a job or cancelling
an active calculation deletes only its temporary preview files, never the print.
A confirmation is required; another upload is needed to calculate that preview
again. Queue changes take effect immediately without saving general settings.

In **Settings > General**, set the **3D background calculation duty cycle**
(10–100%, default 25%). Lower values insert longer pauses between toolpath
processing and serialization steps. Changes apply to the active worker within
about two seconds. Disabling 3D pauses active and queued calculations and skips
queuing new uploads; enabling it again resumes existing jobs.

This is **not an exact CPU-percentage or RAM limit**. ZIP decompression, XML/mesh
processing, compression and the normal upload/cost analysis are not strictly
throttled. Full previews can consume substantial server and browser memory.
The browser's rendering load is not controlled by the server setting.

Jobs and original archives are stored locally in `data/preview-jobs/`, including
when using PostgreSQL or MySQL. Keep this directory on persistent storage and
writable by the app user. After a server restart, interrupted jobs start again
from the beginning (not from a saved intermediate position). Successful jobs
store the compressed preview in the configured database and remove the original
archive. Failed jobs retain the archive for retry; deleting the print cancels
its job and removes its queue files. Back up and protect the entire `data/`
directory, since it temporarily contains original uploads. Use one app instance
per data directory; the queue is not a distributed, multi-replica service.

`npm run build`, `npm run build:webpack`, and the development commands compile
the worker automatically into `.preview-worker/`. When deploying outside Docker,
deploy this directory alongside the built app and its Node dependencies; do not
run `next build` directly instead of the npm build command.

### External filament databases: Spoolman and FilaMan

In the **Settings > External filament databases** tab, enter the server base URL for
Spoolman (for example `http://192.168.1.10:7912`) and/or
[FilaMan System](https://github.com/Fire-Devils/filaman-system) (for example
`http://192.168.1.10:8083`). The address must be reachable **from the 3D-PCC
server/container**, not just from your browser. Reverse-proxy base paths are
supported; an optional trailing `/api/v1` is removed automatically.

FilaMan requires a **user API key** created in FilaMan with spool read access
(`Authorization: ApiKey ...`), not an ESP32/device token. Spoolman normally needs
no key; an optional key is sent as a Bearer token for compatible reverse proxies.
Connections are tested before saving. Clear the address and save to disconnect.
API keys are encrypted with AES-256-GCM in `data/filament-config.json` using the
same local `data/.dbkey` as database passwords. Saved keys are never returned
to the browser. Blank key fields keep the existing key only for the same URL;
changing servers requires re-entering it. Back up the configuration and key
together, and keep them on persistent storage even with PostgreSQL/MySQL.

Use trusted services on your private network and HTTPS when connecting over
untrusted networks. Credentials in URLs and HTTP redirects are not supported.
This local app does not provide a public-network authentication boundary.

In a print's **Cost calculator**, choose **Load / refresh spools**, then select
a spool for each filament. Active (non-archived) spools include material, color,
remaining weight, and price per kg when available. Spool purchase prices take
precedence over filament catalog prices. The kilogram price uses the original
net filament weight, **not the remaining weight**; FilaMan's initial gross weight
is reduced by its empty-spool weight. Missing price or weight is shown explicitly:
enter a manual kilogram price in that case. External and local prices must use
the same currency; there is no exchange-rate conversion.

Save the costs to persist the selected spool and price snapshot. Saved prints
and invoice calculations do not require a live connection and do not silently
change when an external price changes. Load the inventory and choose **Use current
spool price** to explicitly update a selection. A manual price override remains
possible. Local materials and their prices are not imported or modified.
**No filament consumption or stock changes are sent to either service.**

The integration uses Spoolman's `/api/v1/spool` list and FilaMan System's
paginated `/api/v1/spools` API. Results are limited to 10,000 spools per service,
5 MB per response, and a 10-second timeout per request. Errors are shown per
service, so a failure does not prevent selecting spools from the other one.

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

### Custom language packs

Open **Settings → General**, download the translation template, edit its
language code, display name, and translated values, then upload the JSON file.
Save settings and select the new language to apply it. Missing translations
fall back to English. Uploading a pack with the same language code replaces it.
Keep placeholders such as `{count}` unchanged in translated values.

Language pack format:

```json
{
  "code": "fr",
  "name": "Français",
  "translations": {
    "nav.prints": "Impressions",
    "nav.settings": "Paramètres"
  }
}
```

### Support report

Use the **Support export** tab in Settings to download a ZIP containing
`diagnostics.json` and `browser-errors.json`. It includes app/runtime versions,
browser details, selected configuration flags and counts, plus the issue
description and reproduction steps you enter. Browser errors and unhandled
promise rejections are collected in memory only while the Settings page is
open; include them with the unchecked-by-default option and review the captured
messages and stacks before exporting. They are sent only to the app itself to
build the ZIP, not to an external support service. The export excludes
credentials, service URLs, print files, and print names.

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

On Windows, if `better-sqlite3` needs to compile from source, install Python 3
and Visual Studio Build Tools with the **Desktop development with C++** workload.
Make sure `py -3 --version` works in PowerShell, then rerun the installer. If
Python is installed but not detected, set `$env:PYTHON` to the full path of
`python.exe` before running the installer.

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

#### Optional hard CPU and memory limits

Use the additional Compose file to cap the **entire running app container**,
including its background worker:

```bash
docker compose -f docker-compose.yml -f docker-compose.limits.yml up -d --build
```

By default, **no CPU or RAM limit is applied**, even with the additional file.
Set `APP_CPUS` and/or `APP_MEMORY` in the Compose `.env` file beside the Compose
files (not `.env.local`) to enable only the limits you want, for example:

```dotenv
APP_CPUS=0.5
APP_MEMORY=2g
```

Missing, empty, or `0` values leave the corresponding resource unlimited.
Setting only `APP_CPUS` leaves RAM unlimited, and vice versa. Re-run the Compose
command above after changing these values to recreate the container as needed.
Without the additional limits file, these variables have no effect.

The CPU quota is measured in CPU cores (0.5 = half of one core), not a percentage
of the whole machine. These limits do not constrain the image build or the
browser. The memory limit does not make a complete preview smaller: insufficient
RAM may cause worker failure or the container to be OOM-killed. Increase the
limit, or disable 3D previews, if that happens. Interrupted jobs remain on disk
and are attempted again after restart. Use `docker stats 3d-pcc` to monitor load
and `docker inspect 3d-pcc` to inspect applied limits.

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

The database can also be configured in its own **Settings > Database** tab without a
server restart. The connection is tested before saving. The password is
encrypted in `data/db-config.json`, with the key stored in `data/.dbkey`; both
files are local and excluded from Git.
