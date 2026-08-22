/**
 * Guard the two things about Mio's onboarding that are decided here rather than
 * by dsh: which endpoint a key belongs to, and how the step is registered.
 *
 * The wire calls themselves are dsh's and were verified against the running
 * host rather than mocked — `credentials.describe/set` and
 * `settings.describe/mutate` answer the exact shapes `Connect.tsx` reads,
 * including the revision bump on a write. Re-asserting that here would only
 * test a stub.
 */
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { endpointFor, isTokenPlan, REGIONS } from "../src/client/mimo.ts"
import { MIO_LOCALES } from "../src/client/locale.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("a token-plan key routes to its region, and nothing else does", () => {
  assert.equal(isTokenPlan("tp-abc"), true)
  assert.equal(isTokenPlan("sk-abc"), false)

  for (const region of REGIONS)
    assert.equal(endpointFor("tp-abc", region), `https://token-plan-${region}.xiaomimimo.com/v1`)

  // Pay-as-you-go serves one endpoint worldwide, so the region is ignored
  // rather than silently producing a token-plan URL a `sk-` key cannot use.
  for (const region of REGIONS) assert.equal(endpointFor("sk-abc", region), "https://api.xiaomimimo.com/v1")
})

test("an unrecognized key shape still connects", () => {
  // The prefix is a hint for choosing an endpoint, never a gate on the key. A
  // shape the platform adds later must not be refused before it is even tried —
  // the live check is what decides, and it runs against the pay-as-you-go
  // endpoint here.
  assert.equal(endpointFor("mimo_live_abc", "cn"), "https://api.xiaomimimo.com/v1")
})

test("both locales carry every message", () => {
  // dsh ships exactly zh and en and takes them together, so a key present in
  // one and missing from the other degrades to the raw key on screen.
  const en = Object.keys(MIO_LOCALES.en).sort()
  const zh = Object.keys(MIO_LOCALES.zh).sort()
  assert.deepEqual(zh, en)
  for (const [locale, table] of Object.entries(MIO_LOCALES))
    for (const [key, value] of Object.entries(table))
      assert.ok(value.trim().length > 0, `${locale}.${key} is empty`)
})

test("the region hint has a message for every region offered", () => {
  for (const region of REGIONS) assert.ok(`connect.region.${region}` in MIO_LOCALES.en)
})

test("the onboarding registration keeps the properties the surface depends on", async () => {
  // Three couplings to dsh, each of which fails differently if it drifts:
  //
  // - `welcome-notice` at priority -1 shadows dsh's notice. dsh elects the
  //   LOWEST priority and refuses an equal one outright, so a bump that moved
  //   its own notice off 0 would surface as a hard registration error.
  // - `mio-connect` sits between the retired notice (-100) and dsh's DeepSeek
  //   step (0).
  // - `locale` is the framework seat that synthesizes the `t` prop.
  const source = await readFile(path.join(ROOT, "src", "client", "index.tsx"), "utf8")
  assert.match(source, /id: "welcome-notice", order: -100, priority: -1/)
  assert.match(source, /id: "mio-connect"/)
  assert.match(source, /order: -50/)
  assert.match(source, /locale: MIO_NS/)
})
