# Changelog

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
