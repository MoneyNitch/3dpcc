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

- Login, user management and viewer/admin/superadmin/custom roles, with
  user-bound API keys and an environment switch for local login-free operation.
- Versioned REST API with role-checked API keys and a protected,
  locally served Swagger/OpenAPI view at `/api/v1/docs`.
  See [API documentation](./docs/api.md) for setup, endpoints and examples.
  This protects only `/api/v1`, not the existing UI or internal endpoints.

- Drag-and-drop upload of `.gcode.3mf` files on desktop and mobile
- Automatic analysis of total weight, print time, category weights, filament
  colors and types, and objects on the build plate
- Multi-plate 3MF projects show each plate's data and 2D/3D preview; all plates
  can also be selected for total project costs or created as individual saved
  prints after confirmation, and added as separate invoice/quote items
- Select a plate in print details and choose **Rename plate** to save a custom
  name (up to 200 characters). Names appear in previews and document positions.
  Renaming does not change separately saved plate prints or the original archive.
- Local SQLite storage for all prints in `data/3d-pcc.db`
- Cost calculator for material, electricity, machine wear, labor, packaging,
  profit margin and tax
- Configurable material prices, printer profiles and cost settings
- Company sender details for invoice and quote templates are configured under
  **Settings → General**
- Invoice and quote export dialogs offer a preview with the current print,
  costs and customer details before downloading or printing. Previewing does
  not advance the document numbering counter; return to details to edit it.
- Order management at **Orders** stores a customer, status, due date, notes,
  and saved prints with quantities. Prints linked to an order cannot be deleted
  until the order is changed or removed.
  Search customers and combine status, priority and due-date filters with sorting.
  Completed orders are hidden by default; select **All** or **Completed** in the
  status filter to show them. Due dates use the browser's local calendar day:
  active orders due before today are highlighted in red with an **Overdue** badge
  (completed and cancelled orders are never marked overdue). Due-date filters offer
  overdue, today, future and undated orders. Resetting filters restores the default
  view without changing the selected sort order.
- Open an order to view its details, G-code attachment and independent calculation.
  The order history records creation, every saved change and completion times.
  Assign active orders to configured printers in the order form. The print schedule
  shows each printer's queue and expected occupancy from saved print times multiplied
  by order quantities; unknown print times are called out instead of guessed.
  Queues initially sort by due date and then priority and can be manually reordered.
  Edit per-unit material, accessory, electricity and machine costs for each position;
  position quantities come from the order. Labor, packaging and shipping are charged
  once per order. Margin, an explicit order discount and tax apply to the total.
  Per-print labor, packaging, margin, tax and quantity discounts are not added again.
  **Save calculation** freezes the order's own prices, hourly rate and currency
  without changing print calculations or inventory. Later price changes do not
  affect saved orders. **Apply current print costs and save** requires confirmation
  and replaces custom position prices with current print costs and order quantities.
  Changing order positions flags the old snapshot until explicitly recalculated.
  Currency changes are not automatically converted. Snapshots are included in backups;
  completed-order statistics use them, with the original calculation fallback for
  older orders without a snapshot. Statistics show different currencies separately
  rather than adding or converting their values.
- **Products** stores a 3MF file per product type. Configure a unique prefix and
  zero-padded sequence length for each type, then generate up to 1000 serial
  numbers at a time and download the batch as CSV. The next number is advanced
  atomically so concurrent requests cannot issue the same serial number.
  Link a product type to a saved print and use that print's thumbnail, upload a
  separate product photo, or leave the product without a photo. Product files,
  photos and numbering settings are included in encrypted application backups.
- Spoolman and FilaMan System connections with per-filament spool
  selection in the cost calculator
- **Accessory inventory** on its own **Accessory database** page (between Customers
  and the user menu) stores pack prices,
  units per pack and stock quantities. Record receipts and signed corrections
  with a movement history. Select catalog accessories in a print's additional
  costs, then explicitly confirm stock deduction from the calculator; order
  details can deduct the selected accessories for all saved print positions.
  Repeated deductions and deductions exceeding available stock are blocked.
  Inventory and its history are included in application backups.
  Search by name/ID, filter in-stock/out-of-stock articles, and view item-specific
  movement history. Item edits are saved immediately; stock changes have a separate
  confirmation step. Article creation/editing and stock changes open in a modal;
  cancel or Escape closes it without saving. Corrections use a signed delta, not a
  target stock quantity.
  Use **Update stock for this print** below quote creation to deduct all selected
  spools and accessories with one confirmation. Filament usage follows the current
  plate selection and print quantity. Results are shown separately because external
  spool services and local accessory inventory cannot share an atomic transaction.
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

### Original archive downloads

Enable **Settings > General > Retain original files and allow downloads** to
keep new `.3mf` / `.gcode.3mf` uploads for later download from print details or
`GET /api/v1/prints/{id}/download` (API key required). This is off by default;
older uploads need to be uploaded again after enabling it.
Disabling retention keeps existing files but blocks downloads and stops retaining
new uploads. Deleting a print removes its original; linked individual plate
prints download the complete source archive while the source print exists.

Original bytes are stored in `data/original-archives/`, independently of the
temporary 3D queue, even when PostgreSQL/MySQL is used or 3D previews are disabled.
Allow sufficient disk space, preserve write permissions, and back up this
directory with the database. Backend transfers on the same instance retain this
local directory; moving to another host requires copying it as well.

### Backup and restore

Superadmins and custom roles with database-management permission can create and
restore backups under **Settings → Database**. Each `.3dpcc` backup is encrypted
with AES-256-GCM using a passphrase-derived key; choose a strong passphrase and
store it separately because it cannot be recovered.

The archive includes application settings, prints and cost inputs, saved 3D
models, orders, users, password/API-key hashes and roles, Spoolman/FilaMan
connection settings, retained original uploads, and local preview-queue files.
Backups and restores are limited to 512 MB. Restore validates the archive, then
replaces those application records and local files; the database connection
configuration and environment variables of the current installation are not
changed. Restoring replaces the user database too, so active sessions are invalidated and you must
sign in again with an account from the backup.

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
Selecting a spool or saving costs never changes inventory. Use **Deduct consumption**
in the calculator to book actual usage, and explicitly confirm the displayed
grams before submitting. Consumption includes the selected plate(s) multiplied by
quantity and is grouped per spool. The current external stock is checked first;
unknown or insufficient stock is rejected. FilaMan requires the additional
`spool_events:create_consumption` permission. Spoolman uses
`PUT /api/v1/spool/{id}/use`; FilaMan uses
`POST /api/v1/spools/{id}/consumptions`.

There are no automatic retries. If a request times out or its result is uncertain,
check the external inventory before trying again: the booking may already have
succeeded. Each attempt is kept in the database-backed booking journal and included
in backups. The same print and spool cannot be booked again accidentally after a
reload; uncertain outcomes stay blocked until checked. A confirmed reversal adds an
internal journal entry only and does not change the external spool stock.

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

### Changelog, update checks and offline operation

**Settings → Changelog & updates** shows the bundled `CHANGELOG.md` and can load
the current file from GitHub's default branch. Stable releases (not prereleases
or branch commits) are compared numerically with the installed package version;
a newer release shows a notification in Settings. No update is installed automatically.
The user dropdown also displays the installed version at the bottom and any cached
new-release notification. Settings checks update this indicator immediately;
opening the dropdown does not trigger GitHub requests. Users with Settings access
can open the update details from the notification.

Both **Load current changelog from GitHub** and **Check for updates on GitHub**
are enabled by default and saved immediately, independently, for the entire
installation. Turn both off for **zero GitHub traffic from these two features**;
the bundled changelog remains readable. Markdown is formatted with a separate card
for each level-two release heading, including Unreleased. Raw HTML is ignored and
images are displayed as text to prevent automatic external requests; HTTP(S) links
only contact their destination when explicitly opened. There are no timers or background checks.
When enabled, opening Settings makes server-side requests to `api.github.com`,
with a one-hour success cache, a five-minute error cache, a 10-second timeout
and a 512 KiB response limit. **Refresh from GitHub now** bypasses the cache.
No print, customer or credential data is sent; GitHub sees the server's public
IP address and the application's generic User-Agent. Release links contact
GitHub only when explicitly opened. Errors are visible, with local changelog
fallback rather than a claim that the installation is up to date.

These switches are not a global network firewall: filament integrations, Next.js
telemetry and other system services are independent. For a fully isolated
installation, also disable external integrations, set `NEXT_TELEMETRY_DISABLED=1`
and enforce outbound blocking at the OS/container/network level.

### Login and roles

Login is **enabled by default**. On the first login use **admin / admin**.
This initial account is a **superadmin** and must change **both its username
and password before accessing the application**, including setup and APIs.
New passwords default to 12–128 characters; usernames have 3–64 characters
(`A–Z`, `a–z`, `0–9`, `.`, `_`, `-`) and are stored lowercase.
Secure this known initial account immediately, before exposing the server to
other users. There is no public registration.

Superadmins use **Settings → User management** to create, edit,
disable or delete accounts, reset passwords, define named custom roles and
issue/revoke user-bound API keys. New/reset passwords must be changed at the
next login. Click your username in the navigation to open the user menu with
**Change password** and **Sign out**.
Each role card offers **View permissions**, including the predefined Viewer,
Admin and Superadmin roles. The list is read-only; built-in roles remain immutable.

Under **Password requirements**, superadmins can set the minimum length
(4–128 characters) and independently require uppercase letters, lowercase
letters, digits and special characters (whitespace does not count as a
special character). Save these rules before creating or resetting passwords.
They are enforced server-side for new, reset and changed passwords; existing
passwords, sessions and API keys remain valid when the rules change. The known
initial password `admin` remains disallowed as a new password. Short passwords
are easier to guess; at least 12 characters are recommended, especially for
network-accessible deployments. The rules are stored in the local authentication
database, independently of normal application settings and the print database.

| Role | Permissions |
|---|---|
| Viewer | View prints, calculations, document templates and regular settings. Local calculation changes cannot be saved. |
| Admin | Additionally create/edit/delete prints and edit invoices, quotes, templates, numbering and regular settings. |
| Superadmin | Additionally manage users, roles, database connections/transfers, filament connections, support exports and API keys. |
| Custom | Individually selected permissions; necessary read permissions are added automatically. User/role/API-key management remains superadmin-only. |

Roles are enforced server-side on pages, internal APIs and `/api/v1`, not
just by hiding buttons. An active superadmin must always remain; your own
account cannot be deleted, disabled, demoted or reset through user management.
Viewer calculations remain interactive locally, but persistence is forbidden.

To disable **all browser login and role checks**, set in `.env.local`:

```dotenv
AUTH_ENABLED=false
```

Restart the server after changing environment values. With login disabled,
the existing local UI/internal APIs are unrestricted and user management is
hidden. Use this only on a trusted network. Existing accounts are preserved
and become active again when login is re-enabled. `/api/v1` still requires
legacy `API_KEYS` in this mode; without them it returns HTTP 503.
With login enabled, environment `API_KEYS` are ignored: create user-bound
keys in User management after the target account has changed its assigned
password. Keys inherit that user's current permissions and are shown only
once. If a key is lost, superadmins can **Regenerate** it in User management.
The old key stops working immediately; the replacement is shown once and
keeps the same name and user. Update connected applications with the new key.
Regeneration also ends that user's documentation sessions, but leaves browser
app sessions and other API keys intact. See [API documentation](./docs/api.md).

Passwords are salted scrypt hashes. Sessions use random, hashed server-side
tokens and `HttpOnly`, `SameSite=Lax` cookies. By default, sessions expire after
12 hours. The login form's **Stay signed in** option persists the cookie across
browser restarts and extends that limit to 30 days; it is an absolute expiry, not
sliding, so you must sign in again after 30 days.
Logout revokes the current session. Changing credentials, resetting/editing/
disabling/deleting users or changing their custom role revokes their sessions
and API keys. Login attempts are rate-limited persistently (10 attempts per
username per 15 minutes, 100 total per minute).

Authentication is stored separately in **`data/auth.db`**, irrespective of
the print database backend. It remains local even with PostgreSQL/MySQL and
is not copied by the print-database transfer or included in support exports.
Back up and protect the complete `data/` directory; loss of the auth database
recreates the known bootstrap credentials. Run one app instance per data
directory and do not expose it without first securing the bootstrap account.

For HTTPS behind a reverse proxy, set the exact public origin and force
secure cookies:

```dotenv
AUTH_ORIGIN=https://3dpcc.example.com
AUTH_COOKIE_SECURE=true
```

These variables **do not enable TLS by themselves**. Enable an HTTPS listener
and a trusted certificate on your existing reverse proxy, redirect HTTP to HTTPS,
and restart 3D-PCC with the variables above (`.env.local` for npm, `.env` for
Compose). Keep the internal application port reachable only by the proxy.
The browser must trust the certificate, including on local networks.

Example nginx configuration (replace the hostname, certificate paths and upstream
address with your installation values):

```nginx
server {
    listen 80;
    server_name 3dpcc.example.com;
    return 301 https://3dpcc.example.com$request_uri;
}
server {
    listen 443 ssl;
    server_name 3dpcc.example.com;
    ssl_certificate /etc/nginx/certs/3dpcc.crt;
    ssl_certificate_key /etc/nginx/certs/3dpcc.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 512m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

Validate the proxy configuration before reloading it. On Linux/nginx, use
`sudo nginx -t` and then `sudo systemctl reload nginx`. For a proxy on a different
host/container, replace `127.0.0.1` with the private application address and
restrict that port with a firewall or private Docker network. Verify the HTTPS
URL, successful sign-in, customer saving and API access before enabling redirects.
Do not set secure cookies while continuing to use the HTTP browser URL.

Customer management, API-key management and the API documentation show an
informational HTTPS recommendation when the **browser** uses HTTP. Detection uses
the browser protocol, not untrusted forwarding headers, so a TLS-terminating proxy
with an HTTP upstream does not cause a false warning.

Without `AUTH_ORIGIN`, mutation requests must originate from the request
host/protocol. Include the port if non-standard. HTTPS is required over
untrusted networks. Docker Compose forwards all three auth variables from
its `.env`. `AUTH_ENABLED` accepts only `true` or `false`; invalid values
fail closed. Run `npm run test:auth` for authentication and route integration
tests, and `npm run test:api` for legacy API regression tests.

### Customers and order workflow

**Customers** provides creation, editing, search by name/company/email/phone,
archiving/reactivation, billing/shipping addresses, internal notes and links to
related orders. The existing `documents.read` / `documents.write` permissions
control access. Customer records are stored in the selected database and included
in encrypted backups and database transfers.
Customer creation and editing open in a scrollable modal. Cancel, the close button
or Escape closes it without saving; save errors remain visible inside the modal.

Choose a directory customer in the order form or retain the legacy manual name.
Archived customers cannot be linked to new orders; existing links are preserved.
Contact details are copied into an order snapshot on assignment and do not change
when the directory entry is subsequently edited. Reassigning another customer
creates a new contact snapshot. Customers are archived rather than deleted, so
existing orders remain intact.

Order details use separated item, payment/shipping, customer contact, activity and
calculation cards. Payment status/method/recorded amount and shipping
status/method/tracking number are manually editable and persisted. These do not
process payments, track parcels automatically or reserve inventory. Existing
orders default to unpaid and not shipped. Item amounts are explicitly **base
costs**, while the order total includes order-wide labor, packaging, shipping,
margin, discount and tax. Unsaved/outdated calculations are marked as previews.
The original calculation editor and G-code download remain available.

Use **Create invoice** in the order detail header after saving the current order
calculation. The dialog uses the existing invoice templates, the order's contact
snapshot/billing address, saved prices and saved currency, with editable customer
details, document number, invoice/due dates and discount visibility. All print
positions and quantities are included; once-per-order labor, packaging and shipping,
margin, discount and tax are distributed across position prices rather than added
again. Position totals sum to the rounded invoice total, including very small prices.
Preview does not consume a number. HTML download or printing reserves an automatic
invoice number atomically; repeated exports of the unchanged document in the same
dialog reuse it. Manually entered numbers do not advance the counter and must be
managed by the user. A concurrent numbering/order change is shown as a conflict.
This follows the existing print export: it generates an HTML document, not a saved
invoice ledger entry, and does not mark the order paid or deduct inventory.
Creating invoices requires `documents.write`; reading an order alone is insufficient.

The order overview now separates **Order overview** and **Print schedule**.
Clickable summary cards filter active, in-production, ready and overdue orders.
The existing default still hides completed orders; the new active filter also
excludes cancelled orders. Compact order cards show quantities, payment status
and the saved calculation price/currency, explicitly marking outdated snapshots.
Notes are expandable; sorting, search, G-code management, queue reordering and
printer visibility preferences remain available.

### Accessory label designer

Open **Accessory database → Label designer** or **Print label** on an item.
Templates are shared across accessory items and saved in the selected database,
including encrypted backups and database transfers. Template editing requires
`settings.write`; catalog viewing and label preview/printing require `settings.read`.
The former `Settings → Accessories` tab has moved; `/settings?tab=accessories`
redirects to `/accessories`. Regular Settings saves preserve the separately managed
catalog and templates, including when another tab contains older Settings data.

Set label width/height in millimeters (15–300 mm), add text, QR or Code 128 elements,
and drag them or edit their X/Y positions and sizes. Arrow keys move a focused
element by 1 mm. Text can use `{{name}}` and `{{id}}`; codes default to the item ID
and may also use custom text. **Use numeric ID** sets the selected element's content
to `{{numericId}}`. Every accessory receives a permanently saved sequential number;
existing articles are numbered automatically. Numbers remain unchanged when editing,
are not reused after deletion, and are included in backups/database transfers.
The internal `{{id}}` remains unchanged for existing references. Numeric IDs work
as text, QR and barcode and can also be searched in the catalog.
QR and barcodes can coexist. Code 128 supports
1–100 printable ASCII characters; use QR for other characters. Rendering is local
and does not send label content to external services.

Preview and single-label printing use the same SVG and physical dimensions.
Choose the matching paper size, 100% scale, no margins and no headers/footers
in the browser/printer dialog. Labels must fit the printer's printable area.
The designer rejects overflowing text/elements, overlapping code areas and codes
too dense for their available size. QR has a four-module quiet zone; barcodes
include quiet zones and a minimum narrow-bar width check. Actual scanner readability
also depends on printer resolution and media; verify a test label on your printer.

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
