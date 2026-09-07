# Changelog

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
