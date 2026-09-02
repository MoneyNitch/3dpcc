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
- `npm run build`: production build using Turbopack.
- `npm run build:webpack`: production build fallback for Raspberry Pi/ARM
	devices where Turbopack may crash.
- `npm run start`: start the production build; run `npm run build` first.
- `npm run lint`: run ESLint.

Node.js must be version 22 or newer because `better-sqlite3@13` requires it.

## Architecture

- `src/app/page.tsx`: dashboard, upload, saved print list. It requires setup
	completion before showing the dashboard.
- `src/app/prints/[id]/page.tsx`: print detail, per-material weight matrix,
	object breakdown, extra costs, and calculator.
- `src/app/settings/page.tsx`: database, language/currency, materials, printer,
	and cost settings.
- `src/components/`: client UI components. Shared print calculator state lives
	in `src/lib/costInputsContext.tsx` so `CostCalculator` and `ExtraCostsCard`
	can edit the same saved project inputs.
- `src/lib/threemf/parser.ts`: parses Bambu Studio/OrcaSlicer `.gcode.3mf`
	archives. It needs `Metadata/slice_info.config` and `Metadata/plate_N.gcode`.
- `src/lib/threemf/gcodeAnalyzer.ts`: tracks positive extrusion by object,
	category, and real T-tool slot. It ignores firmware placeholder tools such
	as `T1000` and `T65535`.
- `src/lib/costCalculator.ts`: calculates material, extra material, electricity,
	machine, labor, packaging, margin, tax, quantity, and final price.
- `src/lib/i18n.ts` and `src/lib/locale.tsx`: German/English translations and
	locale-aware EUR/USD formatting. In English, German `MwSt.` must be labelled
	`Tax`, not `VAT`.
- `src/lib/setupGuard.ts`: redirects first-time users to `/settings` until the
	main settings form saves `setupCompleted: true`.

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

When adding fields to persisted JSON, update `defaultCostInputs`,
`defaultSettings`, and the relevant migration/fallback logic so existing local
databases continue to work.

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

## Editing Guidance

Keep user-facing text in `src/lib/i18n.ts` when a feature is visible in both
languages. Use `useLocale()` in client components and `translate()` with the
settings language in server components. Preserve the existing dark-mode classes
and responsive layout. Do not commit `data/`, credentials, `node_modules/`, or
`.next/`.
