<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 3D-PCC Project Context

3D-PCC (3D-PrintCostCalc) is a German-first local 3D-print cost calculator.
It is a Next.js 16 App Router application using TypeScript, React 19,
Tailwind CSS v4, and server-side database access.

## Commands

- `npm install`: install dependencies for the current OS/CPU.
- `npm run dev`: start the development server. `PORT=xxxx` can be set in
	`.env.local` and is loaded by `scripts/with-env.js` before Next starts.
- `npm run dev:webpack`: start development with Webpack if Turbopack is blocked
	by platform/native-binding issues.
- `npm run build`: production build.
- `npm run build:webpack`: Webpack build fallback for Raspberry Pi/ARM or
	platform/native-binding issues.
- `npm run start`: start the production build; run `npm run build` first.
- `npm run lint`: run ESLint.

See [README.md](README.md) for production/background startup, Docker, and
Raspberry Pi setup details.

Node.js must be version 22 or newer because `better-sqlite3@13` requires it.

## Architecture

- `src/app/page.tsx`: dashboard, upload, saved print list. It requires setup
	completion before showing the dashboard.
- `src/app/prints/[id]/page.tsx`: print detail, per-material weight matrix,
	object breakdown, extra costs, and calculator.
- `src/app/invoices/page.tsx` and `src/app/quotes/page.tsx`: invoice and quote
	workflows; both require setup completion.
- `src/app/settings/page.tsx`: database, language/currency, materials,
	accessory materials, printers, costs, invoice/quote templates, and numbering.
- Pages and API routes access the server-side database. Client components use
	API routes for persistence; shared print calculator state is provided by
	`src/lib/costInputsContext.tsx` so `CostCalculator` and `ExtraCostsCard` can
	edit the same saved project inputs.
- `src/lib/threemf/parser.ts`: parses Bambu Studio/OrcaSlicer `.gcode.3mf`
	archives. It needs `Metadata/slice_info.config` and `Metadata/plate_N.gcode`.
- Slicer metadata provides authoritative per-filament totals when available;
	G-code header weights are the fallback. Object/category weights are estimates
	that distribute per-filament totals according to positive extrusion parsed
	from G-code, not exact per-object slicer measurements.
- `src/lib/threemf/gcodeAnalyzer.ts`: tracks positive extrusion by object,
	category, and real T-tool slot. It ignores firmware placeholder tools such
	as `T1000` and `T65535`.
- `src/lib/costCalculator.ts`: calculates material, extra material, electricity,
	machine, labor, packaging, margin, tax, quantity, and final price.
- `src/lib/i18n.ts` and `src/lib/locale.tsx`: German/English translations and
	locale-aware EUR/USD formatting. In English, German `MwSt.` must be labelled
	`Tax`, not `VAT`.
- `src/lib/locale.tsx` initializes client locale access from the async root
	layout; use `useLocale()` in client components and `translate()` in server
	components.
- `src/lib/setupGuard.ts`: redirects first-time users from the dashboard,
	print detail, invoices, and quotes to `/settings` until setup is completed.

## Database

`src/lib/db/` defines the async `DataStore` abstraction:

- `sqliteStore.ts`: default local backend, stored at `data/3d-pcc.db`.
- `postgresStore.ts`: PostgreSQL via `pg`.
- `mysqlStore.ts`: MySQL/MariaDB via `mysql2/promise`.
- `index.ts`: selects the backend from the saved UI config, then falls back to
	`DB_DRIVER` and `DATABASE_URL` environment variables.

The database tables are created automatically. All database functions are async
and callers must use `await`. `dbConfig.ts` stores UI database configuration in
`data/db-config.json`; passwords are AES-256-GCM encrypted using `data/.dbkey`,
never returned to the browser, and remote credentials are connection-tested
before they are saved. The entire `data/` directory is gitignored.

When changing persisted data, update the owning compatibility path: settings
fields belong in `defaultSettings` and `migrateSettings` in `shared.ts`; print
cost-input fields belong in `defaultCostInputs` in `costCalculator.ts` and must
remain compatible with older saved inputs. Print records are parsed from stored
JSON without a general schema migration, so add fallbacks for newly introduced
optional fields when reading older records.

Invoice and quote templates are separate settings collections. Their shared
designer lives in `src/components/InvoiceTemplateBuilder.tsx`; invoice document
logic is in `src/lib/invoice.ts`.

## Raspberry Pi

Never copy `node_modules` or `.next` from Windows to the Pi. On the Pi, with
Node.js 22+ installed, run:

```bash
rm -rf node_modules .next
npm install
npm run build
npm run start
```

If `npm run build` crashes with `SIGSEGV` during page-data collection, first
run `node -e "require('better-sqlite3')"`. Rebuild it with
`npm rebuild better-sqlite3 --build-from-source` if that crashes; otherwise use
`npm run build:webpack`. Low-memory Pis may need additional swap.

For Docker deployment and bind-mount permissions, follow the Docker section in
the README. The mounted `data/` directory must be writable by the container's
non-root user.

## Editing Guidance

Keep user-facing text in `src/lib/i18n.ts` when a feature is visible in both
languages. Use `useLocale()` in client components and `translate()` with the
settings language in server components. Preserve the existing dark-mode classes
and responsive layout. Do not commit `data/`, credentials, `node_modules/`, or
`.next/`.
