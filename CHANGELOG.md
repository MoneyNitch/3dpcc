# Changelog

## v0.9.0 — Product catalog, order planning and labels

### Changed
- The order overview has clickable status summaries, separate overview/planning
  views, grouped filters and compact cards with saved prices and payment status.
- Accessory management moves from Settings to its own navigation page with search,
  stock filters, article cards, separate confirmed stock changes and per-item history.
- GitHub preference switches save only their two supported fields, so toggling
  them is no longer rejected because of unrelated general settings.
- Settings render the changelog as formatted Markdown, with a separate card for
  each release and Unreleased section. Embedded HTML and automatic image loading
  are disabled; links open only on explicit interaction.
- Manual print creation has a refreshed responsive card layout with grouped print
  details, individual filament cards, a total-weight badge and a clearer image input.
- Product details use a clearer responsive overview, a direct serial-number
  generation action, collapsible appearance settings and a searchable serial list.
- Order deletion conflicts caused by assigned product serial numbers show a
  translated explanation and tell users to unassign the serial numbers first.

### Added
- Settings can independently enable or disable Customers, Products, Orders,
  Invoices and Quotes. Disabled sections are hidden from navigation and direct
  page access, while their saved data is preserved.
- Order details can generate invoices from saved order pricing and contact snapshots,
  using existing templates with preview, HTML download and printing. Automatic
  numbers are reserved atomically; outdated/unsaved calculations cannot be invoiced.
- Accessories receive permanent sequential numeric IDs, including existing articles.
  The label designer supports `{{numericId}}` for text, QR and Code 128;
  deleted numbers are not reused and numbering is included in backups.
- A local accessory label designer supports saved millimeter-sized templates,
  draggable text, QR and Code 128 elements, name/ID variables, custom code content
  and single-label printing. Templates are included in settings migration, backups
  and database transfers; old Settings saves do not overwrite the separate catalog.
- Customer management includes contacts, billing/shipping addresses, internal
  notes, search, archiving/reactivation and related orders. Order customer
  assignment retains a contact snapshot. Customers are included in all database
  backends, database transfers and encrypted backups.
- Order details use separated article, workflow, contact and activity cards.
  Payment status/method/amount and shipping status/method/tracking number can be
  recorded manually without automatic payment processing or stock reservation.
- Customer management, API-key management and API documentation recommend HTTPS
  when opened over HTTP. Reverse-proxy TLS configuration is documented.
- The user dropdown shows the installed version at the bottom and any known newer
  stable release, with a Settings link when permitted. It reuses the update cache
  and Settings checks without making additional GitHub requests.
- Settings display the bundled changelog or the latest GitHub default-branch
  changelog and notify about newer stable GitHub releases. Two independently
  persisted switches control the online features (enabled by default). Disabled
  features perform no GitHub requests; requests have bounded timeouts and caching.
- Role cards in user management expose a read-only list of granted permissions,
  including the predefined Viewer, Admin and Superadmin roles.
- A bulk stock-update button below quote creation deducts all selected filament
  spools and accessories for the print after one confirmation. Existing bookings
  are not repeated; individual results make partial failures explicit.
- Accessory catalog entries track pack price, units per pack and stock quantity.
  Stock receipts and corrections are recorded in a persistent movement history;
  print and order calculators can explicitly deduct saved accessory usage after
  confirmation. Duplicate deductions and insufficient stock are blocked, and
  inventory history is included in backups.
- Order detail history records creation, saved changes and completion timestamps.
- External spool consumption is recorded in a persistent journal included in backups.
  Duplicate bookings for the same print and spool are blocked across reloads;
  uncertain results remain blocked until the external inventory is checked.
- Confirmed reversals can be recorded in the journal. They are internal-only and do
  not modify stock in Spoolman or FilaMan.
- Orders can be assigned to configured printers. The print schedule estimates each
  queue's occupancy from print duration × quantity and supports manual queue order.

## v0.8.0 — User management, customer orders and independent order pricing

### Added
- **Application login and user management** with Viewer, Admin, Superadmin
  and custom roles. Permissions control pages, internal endpoints and
  user-bound API keys.
- **Remember me** for persistent login sessions lasting up to 30 days.
- **API key management** per user, including regeneration of lost keys.
  Regeneration immediately replaces the old key, retains its name and user,
  and displays the replacement only once.
- **Configurable password requirements** in User management: minimum length from
  4 to 128 characters and optional uppercase, lowercase, digit and special
  character requirements. Rules apply to new, reset and changed passwords;
  existing passwords remain valid.
- **Customer order management** with status, priority, due date, notes, linked
  saved prints and per-print quantities. Change status and priority directly
  in the overview without opening the edit form.
- **Order search, filters and sorting**: search customer names and combine
  status, priority and due-date filters. Sort by priority, due date, customer,
  status or creation date in either direction; high priority comes first by
  default. Due-date filters include overdue, today, future and undated orders.
- **Dedicated order detail pages** with customer information, quick status and
  priority controls, print positions and an independent cost calculation.
- **Saved order pricing snapshots** with editable per-unit material, accessory,
  electricity and machine costs. Labor, packaging and shipping apply once per
  order; margin, order discount and tax apply to the total. Saved prices,
  currency and hourly rate remain independent of later print or settings changes.
- **Optional G-code attachments** for orders (`.gcode`, `.gco`, `.gc`, up to
  50 MiB), with download, replacement and removal. Attachments are stored
  separately and are not parsed or added as calculated print positions.
- **Confirmed external spool consumption** for Spoolman and FilaMan System.
  Deduct calculated grams for the selected plates and quantity only after
  confirmation; selections using the same spool are grouped together.
- **Statistics page** showing saved print count, print time, material usage
  by type and the calculated value of completed orders.
- **Password-protected full application backups and restore** under Settings →
  Database, including settings, print data and cost inputs, users, external
  filament settings, orders and pricing snapshots, G-code attachments, retained
  originals and preview queue files.
- German and English texts for the new workflows, plus tests for permissions,
  persistence, backups, order pricing, filters and external stock consumption.

### Changed
- Completed orders are hidden from the order overview by default and can be
  shown with the status filter. Overdue active orders have a red highlight and
  an **Overdue** badge; completed and cancelled orders are never marked overdue.
  Due-date comparisons use the browser's local calendar day.
- Changes to order positions or quantities flag an existing pricing snapshot
  as outdated. Applying current print costs requires confirmation and replaces
  custom position prices while preserving the entered order-wide cost settings.
- Numeric fields in order calculations display two decimal places without
  reducing the precision of untouched calculation values.
- Completed-order statistics use saved order prices where available, with the
  previous live print-calculation fallback for orders without a snapshot.
  Different currencies are displayed separately, not added or converted.
- Prints linked to an order cannot be deleted until they are unlinked.
- With login enabled, versioned API access uses user-bound keys and role
  permissions. Local login-free operation remains available through
  `AUTH_ENABLED=false`.

### Notes
- This release introduces application-wide authentication, superseding the
  API-only authentication limitation documented for v0.7.0. Continue using
  3D-PCC on a trusted private network.
- Order calculations do not modify saved print calculations or automatically
  deduct inventory. Refreshing a saved order in a different currency is blocked;
  no automatic currency conversion is performed.
- External stock is never changed merely by selecting a spool or saving costs.
  Consumption requires sufficient known stock and an explicit confirmation.
  Uncertain provider outcomes are reported without automatic retries; check the
  external inventory before attempting another booking. A persistent consumption
  journal is not included in this release.
- G-code attachments remain optional; creating an order still requires a customer
  name and at least one saved print position.
- Restore replaces application records, local backup-managed files and users,
  and invalidates active sessions. Database connection settings and environment
  variables of the current installation are preserved.

## v0.7.0 — REST API, multi-plate projects and document previews

### Added
- **Versioned REST API** under `/api/v1` for prints, 3MF uploads, cost
  calculation, settings, materials, accessories, printers, invoice/quote
  templates, and HTML document generation.
- **Environment-configured API keys** through comma-separated `API_KEYS`,
  with Bearer authentication. Key management is currently environment-only;
  without valid configuration, the versioned API remains disabled.
- **Protected OpenAPI 3.1 documentation and interactive Swagger UI** at
  `/api/v1/docs`, generated from the API operations and validation schemas.
  Includes endpoint filtering, larger operation cards and inputs, responsive
  layout, and light/dark styling. Assets are served locally without a CDN.
- **Multi-plate project support**: select individual plates with their own
  metadata, thumbnails and 3D previews, calculate all plates together, or create
  individual saved plate prints without duplicating existing linked prints.
- **Editable plate names** in print details and through the API, persisted
  per print and used in invoice/quote positions.
- **Original archive downloads**, enabled through Settings → General.
  New uploads can be retained and downloaded unchanged from print details or
  the API, independently of 3D preview generation.
- **Invoice and quote previews** with current print, cost and customer data,
  directly in the export dialog without printing or advancing document numbering.
- **Quantity discounts** with a configurable threshold and percentage, applied
  before tax. Defaults are 5% from a quantity of 5; the discount row can be
  shown or omitted in exported documents without changing the final total.
- **Company sender details** in Settings → General for shared use by invoice
  and quote templates.
- **Print ID display** in small text on the print detail page.
- [API setup and usage documentation](./docs/api.md), plus tests for API
  authentication, validation, persistence, original downloads and plate renaming.

### Changed
- Project-wide calculations sum plate-specific material, energy and machine
  costs while applying shared labor, packaging and extra costs once per project
  copy. A measured energy override applies to the entire selected project.
- Invoice/quote exports can list selected plates as individual positions with
  allocated amounts. Compact tables move following template elements when
  additional rows exceed the configured table height.
- Cost breakdown amounts now reflect the configured quantity consistently.
- Settings navigation groups document numbering and database configuration
  into dedicated tabs.
- API requests use validated input schemas, bounded request sizes, pagination
  for print lists, explicit error responses and private, non-cached responses.
- Docker Compose forwards `API_KEYS`; standalone builds include local Swagger
  assets. Existing settings and saved prints remain compatible through defaults
  and fallbacks for new fields.

### Fixed
- Missing German and English upload confirmation texts, including the button
  previously displaying `upload.submit` and the print-name input labels.
- Narrow Swagger endpoint layout caused by login styles affecting the
  documentation content area.
- Selection of older saved plates without explicit plate indices.

### Notes
- API-key protection applies **only to `/api/v1`**, not to the existing
  application UI or internal endpoints. Continue using 3D-PCC on a trusted
  private network; this release does not add global application authentication.
- Original retention is **off by default**. Older uploads must be uploaded again
  with retention enabled. Disabling it keeps retained files but blocks downloads
  and stops retaining new uploads; deleting a print removes its original.
  Back up `data/original-archives/` alongside the database, including when using
  PostgreSQL or MySQL/MariaDB.
- Linked plate prints download the complete source archive while it exists.
  Renaming a plate does not modify the original archive or separately saved
  plate prints.
- Re-upload older projects to generate missing per-plate preview data.
- API-generated invoices and quotes are printable HTML, not archived documents
  or server-generated PDFs. The caller supplies the document number; API
  generation does not consume numbering counters.

## v0.6.1 — Installation and support export fixes

### Changed
- The Windows installer now stops with an explicit error when `npm install`
  fails instead of displaying a success message.
- Documented the Python 3 and Visual Studio C++ Build Tools prerequisites for
  compiling `better-sqlite3` on Windows.

### Fixed
- Fixed the production TypeScript build error when returning the support ZIP
  from the API route by converting the Node.js buffer to a `Uint8Array`.

## v0.6.0 — External filament services, language packs and support export

### Added
- **External filament database connections** for Spoolman and FilaMan System,
  including connection testing, encrypted API-key storage, and per-filament
  spool selection in the cost calculator.
- **Custom language packs**: download a translation template, import or replace
  a JSON pack, and use the added language throughout the application. Missing
  translations fall back to English.
- **Support ZIP export** with app, runtime, browser and selected configuration
  diagnostics, plus an optional issue description and reproduction steps.
- **Optional browser error collection** for JavaScript errors and unhandled
  promise rejections while Settings is open. Logs remain in memory until export,
  are opt-in, and can be reviewed before inclusion.

### Changed
- Number, currency and date formatting now supports custom language codes.
- Settings validation and migrations preserve compatibility with existing
  settings when custom language packs are not present.

### Fixed
- Added the missing printer button translation in German and English.

## v0.5.1 — Preview queue management

### Added
- **Queue tab in Settings** showing waiting, processing, failed and unsupported
  3D preview jobs, with print names and links to their detail pages.
- **Automatic refresh**, a manual refresh button, and a pause indicator when
  3D previews are disabled.
- **Persistent job ordering**: move waiting jobs up or down to change their
  execution order, including across server restarts. The active calculation
  cannot be reordered.
- **Remove or cancel preview jobs**, including active calculations, with a
  confirmation before deleting their temporary files.
- German and English translations for queue management, including loading,
  empty and error states.

### Changed
- Queue actions take effect immediately without saving general settings.
- Queue scheduling, ordering, cancellation and result persistence are serialized
  to prevent conflicting changes during background processing.

### Fixed
- Race conditions between cancellation and automatic scheduling that could
  otherwise start work after its job had been removed.

### Notes
- Removing or cancelling a preview job does **not** delete the saved print or
  its cost data. To calculate the removed preview again, upload the file again.

## v0.5.0 — Interactive 3D previews and background processing

### Added
- **Interactive 3D preview** on print details, with 2D/3D switching, rotation,
  zoom and a reset-view button.
- **G-code toolpath fallback** for sliced archives without usable embedded
  model meshes. All depositing segments are retained, including subdivided
  clockwise and counterclockwise XY arcs, without sampling or thinning.
- **GPU-rendered filament strands** using WebGL2, with filament colors and
  slicer-provided extrusion widths and layer heights.
- **Persistent background queue** for preview generation: one worker processes
  uploads sequentially while print costs and the 2D thumbnail remain usable.
  Pending previews update automatically; failed calculations offer a retry.
- **3D controls in Settings → General**: enable or disable previews and adjust
  the background calculation duty cycle from 10–100% (default 25%). Lower
  values insert work pauses without reducing preview detail.
- **Optional Docker resource limits** through `docker-compose.limits.yml`.
  Set `APP_CPUS` and/or `APP_MEMORY` in the Compose `.env` file to limit the
  entire app container. Missing, empty or `0` values leave the corresponding
  resource unlimited; no CPU or RAM cap is applied by default.
- **App version display** in the general settings.

### Changed
- Preview generation now runs outside the upload request in a separate worker.
  Disabling 3D pauses existing jobs and skips preview generation for new uploads.
- Interrupted jobs restart from the original upload after a server restart.
  Queued and failed jobs retain their archives in `data/preview-jobs/`;
  successful calculations and deleted prints remove their queue files.
- Compressed previews are stored separately from print records in SQLite,
  PostgreSQL and MySQL/MariaDB, transferred during database migration, and
  served as gzip-compressed responses.
- Development and production npm build commands compile the preview worker
  automatically; Docker includes the worker and its runtime dependencies.
- Settings save failures now display an error instead of reporting success.

### Fixed
- TypeScript production-build errors involving nullable canvas references and
  optional 3MF build-item transforms.
- Blank previews after switching back from 2D to an already loaded 3D view.
- Mouse-wheel zoom attempting to prevent scrolling from a passive listener.
- Temporary Windows file locks preventing background job status updates.

### Notes
- Toolpath previews are not the original surface model and do not exactly
  reproduce the slicer's 2D thumbnail. Travel moves and custom machine routines
  are excluded; the first matching G-code plate is displayed.
- The duty-cycle setting is not a hard CPU or RAM limit and does not control
  browser rendering. Full previews can require substantial memory.
- Re-upload older prints to generate missing or replace previously sampled
  preview data. The queue requires persistent, writable `data/` storage and
  supports one app instance per data directory.

## v0.4.0 — Manual prints and QR code sizing

### Added
- **Manual print creation** without a slicer file: enter a name, print time,
  material usage and an optional image (PNG, JPEG or WebP, up to 5 MB).
- **Multiple filaments** for manual prints, each with its own material, color
  and weight. Filaments can also be added, edited or removed later.
- **Per-filament weight categories** for model, support, wipe tower and other
  material. The category weights feed the print breakdown and cost calculation;
  wipe tower material counts toward total usage but not object weight.
- **Image editing** on print details: upload, replace or remove a print image.

### Fixed
- QR codes in the invoice and quote designer now scale with the selected field
  size instead of remaining at a fixed canvas size and getting clipped.

## v0.3.0 — Free-form invoice & quote designer

### Added
- **Free-form designer** replacing the block-based invoice builder: a paper sheet
  (A4, A5, Letter, Legal; portrait or landscape) on which text, image, QR code,
  line-item and totals fields can be freely dragged and resized.
- **Quotes**, built the same way as invoices: its own templates, its own
  `/quotes` designer page, a nav link, and an "Export quote" button next to
  "Export invoice" on the print detail page.
- **QR code field** with a value bound to `{{variables}}`, a dedicated size
  input, and square-locked resizing so it never gets squeezed out of shape.
- **Variables reference** hidden behind a small info icon: hovering it lists
  every available placeholder; clicking one inserts it into the selected text
  field or copies it to the clipboard.
- **Cost line distribution**: any line-item cost line can now be spread
  proportionally across other visible lines directly from its field properties.
- **Totals field**: profit margin and tax can now be shown/hidden independently
  of the line-item list.
- **Configurable document numbering** in Settings → Numbering: prefix, next
  number and zero-padding digits, separately for invoices and quotes. The
  suggested number now comes from this counter and advances automatically after
  a document is generated or downloaded.
- Sample data preview ("Load sample & preview") directly on the design canvas.

### Changed
- Existing invoice templates are migrated automatically from the old
  header/footer/block layout to the new element-based format.
- The invoice paper always renders dark text on a white background, regardless
  of the app's dark mode, since it represents the printed result.
- The invoice/quote preview modal is wider and taller for a more usable preview.

### Fixed
- Production build crash (`document is not defined`) caused by the theme toggle
  reading `document` during server-side prerendering.
- React warning "Cannot update a component while rendering a different
  component" when dragging elements on the design canvas.
- Info popover for the variables reference closing unexpectedly while scrolling
  its list (scroll chaining moved the page under the cursor).
- Missing translation for the tax field in Settings → Costs & defaults
  (showed the raw key `settings.tax` instead of a label).

## v0.2.2 — Invoice builder

### Added
- **Invoice template builder** at `/invoices`, reachable from the header navigation.
  - Drag & drop composition: drag prefabricated blocks (free text, variables, line
    items, totals, spacer) from the palette onto the document, and reorder blocks
    by dragging them.
  - **Variables for every value**: company, customer, invoice, print and amount
    placeholders such as `{{customerName}}`, `{{invoiceNumber}}`, `{{printWeight}}`
    and `{{total}}`. Variables can be clicked or dragged directly onto a block.
  - **Custom variables** per template (e.g. `{{companyIban}}`) with fixed values,
    so company data does not have to be retyped for every invoice.
  - **Logo field**, **header** and **footer** per template.
  - Multiple templates can be created, renamed and deleted.
  - Live preview that renders the exact same document as the export.
- **Invoice export** from the print detail page: pick a template, enter invoice
  number, recipient and dates, then open the print view (A4 portrait) or download
  the invoice as an HTML file.
- **Configurable cost lines** in the line item block: every position can be
  renamed (e.g. "Packaging" to "Shipping"), hidden, or proportionally distributed
  across other positions while keeping the total unchanged.
- **Configurable tax label** in the totals block, defaulting to
  `MwSt. ({{vatPercent}} %)` so the current tax rate is inserted automatically.

### Changed
- Invoice rendering for the builder preview and the export now share a single
  module (`src/lib/invoice.ts`), so preview and result cannot drift apart.
- The theme is stored in a cookie and rendered on the server instead of being
  applied by an inline script, removing the flash of the wrong mode.
- The "Edit values" dialog now uses the same field styling as the rest of the app
  and accepts locale-aware decimals (comma in German, dot in English).
- Removed the simplified duplicate invoice template editor from the settings page
  in favour of the dedicated builder.

### Fixed
- **Hydration error** caused by the theme toggle: the server always rendered the
  light state while the client restored the stored theme, so server and client
  markup disagreed.
- **React warning** about a `<script>` tag rendered inside a component, caused by
  the inline theme initialization script.
- **Blank print view**: the invoice print view opened an empty `about:blank` page
  because `window.open` with `noopener` returns `null`, so the document was never
  written. The print view is now served from a blob URL.

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
