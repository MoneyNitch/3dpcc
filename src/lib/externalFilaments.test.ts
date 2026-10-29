import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type RequestListener } from "node:http";
import { test } from "node:test";
import {
  fetchExternalSpools,
  externalSpoolKey,
  FilamentServiceError,
  normalizeFilamentServiceUrl,
  parseExternalSpools,
} from "./externalFilaments";

function spoolmanSpool(id = 1) {
  return {
    id,
    price: 15,
    initial_weight: 500,
    remaining_weight: 100,
    filament: { name: "Red", material: "PLA", color_hex: "FF0000", price: 20, weight: 1000, vendor: { name: "Maker" } },
  };
}

function filamanSpool(id = 1) {
  return {
    id,
    purchase_price: 12,
    initial_total_weight_g: 700,
    empty_spool_weight_g: 200,
    remaining_weight_g: 100,
    filament: {
      designation: "Red",
      material_type: "PLA",
      price: 25,
      raw_material_weight_g: 1000,
      manufacturer: { name: "Maker" },
      colors: [{ position: 1, color: { hex_code: "#FF0000" } }],
    },
  };
}

async function withServer(listener: RequestListener, run: (url: string) => Promise<void>) {
  const server = createServer(listener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("normalizes service URLs and rejects embedded credentials and non-HTTP protocols", () => {
  assert.equal(normalizeFilamentServiceUrl(" http://localhost:7912/proxy/api/v1/ "), "http://localhost:7912/proxy");
  for (const input of ["ftp://localhost", "https://user:password@localhost", "http://localhost/?key=secret", "http://localhost/#token"]) {
    assert.throws(() => normalizeFilamentServiceUrl(input));
  }
});

test("spool identities distinguish providers and servers with the same spool ID", () => {
  const [spool] = parseExternalSpools("spoolman", [spoolmanSpool()]);
  assert.notEqual(externalSpoolKey({ ...spool, sourceUrl: "http://first" }),
    externalSpoolKey({ ...spool, sourceUrl: "http://second" }));
  assert.notEqual(externalSpoolKey(spool), externalSpoolKey({ ...spool, provider: "filaman" }));
});

test("Spoolman uses purchase price and original net weight, not remaining weight", () => {
  const [spool] = parseExternalSpools("spoolman", [spoolmanSpool()]);
  assert.equal(spool.pricePerKg, 30);
  assert.equal(spool.remainingGrams, 100);
  assert.equal(spool.name, "Maker Red");
  assert.equal(spool.color, "#FF0000");
  assert.deepEqual(parseExternalSpools("spoolman", [{ ...spoolmanSpool(), archived: true }]), []);
});

test("FilaMan subtracts tare weight from gross weight for spool purchase prices", () => {
  const [spool] = parseExternalSpools("filaman", [filamanSpool()]);
  assert.equal(spool.pricePerKg, 24);
  assert.equal(spool.remainingGrams, 100);
  assert.equal(spool.color, "#FF0000");
});

test("uses catalog prices only when no spool price exists and preserves zero prices", () => {
  const catalog = { ...spoolmanSpool(), price: null, initial_weight: 500 };
  assert.equal(parseExternalSpools("spoolman", [catalog])[0].pricePerKg, 20);
  assert.equal(parseExternalSpools("filaman", [{ ...filamanSpool(), purchase_price: null }])[0].pricePerKg, 25);
  assert.equal(parseExternalSpools("spoolman", [{ ...spoolmanSpool(), price: 0 }])[0].pricePerKg, 0);
});

test("missing weights do not produce invented prices; malformed records report an error", () => {
  const missing = { ...spoolmanSpool(), initial_weight: null, filament: { ...spoolmanSpool().filament, weight: null } };
  assert.equal(parseExternalSpools("spoolman", [missing])[0].pricePerKg, null);
  const invalidNet = { ...filamanSpool(), empty_spool_weight_g: 800 };
  assert.equal(parseExternalSpools("filaman", [invalidNet])[0].pricePerKg, null);
  assert.throws(() => parseExternalSpools("spoolman", [{}]), FilamentServiceError);
  assert.throws(() => parseExternalSpools("filaman", [{ ...filamanSpool(), purchase_price: -1 }]), FilamentServiceError);
});

test("loads all Spoolman pages using read-only requests and Bearer authentication", async () => {
  const requests: string[] = [];
  await withServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.authorization, "Bearer test-key");
    requests.push(request.url ?? "");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(requests.length === 1
      ? Array.from({ length: 200 }, (_, index) => spoolmanSpool(index + 1))
      : [spoolmanSpool(201)]));
  }, async (url) => {
    const spools = await fetchExternalSpools("spoolman", { url, apiKey: "test-key" });
    assert.equal(spools.length, 201);
    assert.ok(requests[1].includes("offset=200"));
    assert.ok(requests[0].includes("allow_archived=false"));
  });
});

test("loads FilaMan paginated items and authenticates with ApiKey, not Bearer", async () => {
  let requests = 0;
  await withServer((request, response) => {
    requests++;
    assert.equal(request.method, "GET");
    assert.equal(request.headers.authorization, "ApiKey uak.test.secret");
    assert.ok(request.url?.includes(`page=${requests}&`));
    response.end(JSON.stringify({
      total: 201,
      items: requests === 1
        ? Array.from({ length: 200 }, (_, index) => filamanSpool(index + 1))
        : [filamanSpool(201)],
    }));
  }, async (url) => {
    assert.equal((await fetchExternalSpools("filaman", { url, apiKey: "uak.test.secret" })).length, 201);
    assert.equal(requests, 2);
  });
});

test("reports authentication, malformed responses and forbidden redirects explicitly", async () => {
  for (const [status, body, code] of [
    [401, "unauthorized", "auth"],
    [500, "server error", "connection"],
    [200, "<html>login</html>", "response"],
    [200, JSON.stringify({ unexpected: [] }), "response"],
    [302, "", "connection"],
  ] as const) {
    await withServer((_request, response) => {
      response.statusCode = status;
      if (status === 302) response.setHeader("Location", "/redirected");
      response.end(body);
    }, async (url) => {
      await assert.rejects(fetchExternalSpools("spoolman", { url, apiKey: "test" }),
        (error: unknown) => error instanceof FilamentServiceError && error.code === code);
    });
  }
});

test("connection tests read only the first page, even when more spools exist", async () => {
  let requests = 0;
  await withServer((_request, response) => {
    requests++;
    response.end(JSON.stringify(Array.from({ length: 200 }, (_, index) => spoolmanSpool(index + 1))));
  }, async (url) => {
    assert.equal((await fetchExternalSpools("spoolman", { url, apiKey: "" }, true)).length, 200);
    assert.equal(requests, 1);
  });

});

test("rejects oversized responses rather than returning partial inventory", async () => {
  await withServer((_request, response) => {
    response.end("x".repeat(5_000_001));
  }, async (url) => {
    await assert.rejects(fetchExternalSpools("spoolman", { url, apiKey: "" }),
      (error: unknown) => error instanceof FilamentServiceError && error.code === "limit");
  });
});

test("detects servers that repeat the same inventory page", async () => {
  await withServer((_request, response) => {
    response.end(JSON.stringify(Array.from({ length: 200 }, (_, index) => spoolmanSpool(index + 1))));
  }, async (url) => {
    await assert.rejects(fetchExternalSpools("spoolman", { url, apiKey: "" }),
      (error: unknown) => error instanceof FilamentServiceError && error.code === "response");
  });
});
