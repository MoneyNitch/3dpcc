import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../lib/locale";
import { SoftwareUpdateProvider } from "../lib/softwareUpdateContext";
import type { SoftwareInfo } from "../lib/softwareUpdates";
import packageJson from "../../package.json";
import { UserMenuVersion } from "./UserMenu";

function render(update: SoftwareInfo["update"] | null, showSettings = true, language = "de") {
  return renderToStaticMarkup(
    <LocaleProvider initialLanguage={language} initialCurrency="EUR" initialLanguagePacks={[]}>
      <SoftwareUpdateProvider initialUpdate={update}>
        <UserMenuVersion showSettings={showSettings} onNavigate={() => {}} />
      </SoftwareUpdateProvider>
    </LocaleProvider>,
  );
}

test("user menu always shows the installed version without claiming unchecked updates are current", () => {
  for (const update of [null, { status: "disabled" }, { status: "current" }, { status: "error", error: "connection" }] as const) {
    const html = render(update);
    assert.ok(html.includes(`Version: ${packageJson.version}`));
    assert.doesNotMatch(html, /Ein Update ist verfügbar|href=/);
  }
});

test("available updates link to Settings only when the user has access", () => {
  const update = { status: "available", version: "v999.0.0" } as const;
  const html = render(update);
  assert.match(html, /Ein Update ist verfügbar: v999.0.0/);
  assert.match(html, /href="\/settings\?tab=software"/);
  assert.ok(html.indexOf(`Version: ${packageJson.version}`) < html.indexOf("Ein Update"));
  const viewer = render(update, false, "en");
  assert.match(viewer, /An update is available: v999.0.0/);
  assert.doesNotMatch(viewer, /href=/);
});
