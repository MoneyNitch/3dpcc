import assert from "node:assert/strict";
import { test } from "node:test";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/locale";
import { parseManualCategories, parseManualFilaments } from "@/lib/manualPrint";
import { ManualFilaments, manualFilamentPayload, type FilamentDraft } from "./ManualFilaments";

test("adding manual filaments works without secure-context crypto and preserves unique IDs", () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  try {
    let items: FilamentDraft[] = [{
      filamentId: "1", type: "PLA", color: "#ffffff", weight: "10",
      supportWeight: "", towerWeight: "", otherWeight: "",
    }];
    let add: (() => void) | undefined;
    let disabled = false;
    function render() {
      function Capture() {
        const content = ManualFilaments({ items, onChange: (next) => { items = next; }, materials: [] });
        const button = Children.toArray(content.props.children).find((child) =>
          isValidElement(child) && child.type === "button");
        assert.ok(isValidElement<{ onClick: () => void; disabled: boolean }>(button));
        add = button.props.onClick;
        disabled = button.props.disabled;
        return content;
      }
      renderToStaticMarkup(
        <LocaleProvider initialLanguage="de" initialCurrency="EUR" initialLanguagePacks={[]}>
          <Capture />
        </LocaleProvider>,
      );
    }

    render();
    assert.ok(add);
    add();
    assert.equal(items.length, 2);
    assert.notEqual(items[0].filamentId, items[1].filamentId);
    items[1] = { ...items[1], weight: "5", supportWeight: "2" };
    render();
    assert.ok(add);
    add();
    assert.equal(new Set(items.map((item) => item.filamentId)).size, 3);
    items[2] = { ...items[2], weight: "3" };
    const payload = manualFilamentPayload(items);
    const parsed = parseManualFilaments(JSON.stringify(payload.filaments));
    assert.ok(parsed);
    assert.deepEqual(parsed.map((item) => item.usedGramsTotal), [10, 7, 3]);
    assert.ok(parseManualCategories(JSON.stringify(payload.categoryByFilament), parsed));

    while (items.length < 32) {
      render();
      assert.equal(disabled, false);
      assert.ok(add);
      add();
    }
    render();
    assert.equal(disabled, true);
    assert.equal(new Set(items.map((item) => item.filamentId)).size, 32);

    items = [items[0]];
    Object.defineProperty(globalThis, "crypto", {
      configurable: true, value: { randomUUID: () => items[0].filamentId },
    });
    render();
    assert.ok(add);
    add();
    assert.notEqual(items[0].filamentId, items[1].filamentId);
  } finally {
    if (originalCrypto) Object.defineProperty(globalThis, "crypto", originalCrypto);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});
