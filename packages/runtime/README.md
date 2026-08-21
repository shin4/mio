# @mio/runtime

Mio's agent runtime, composed on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(dsh). See MIGRATION.md at the repo root for the replacement plan and decision record.

## What lives here

- `mio.patch.yml` — the Mio patch layer over dsh's `web` profile. It configures **dsh's own
  `llm-pi-ai` adapter** to serve MiMo and defaults sessions to `mimo-v2.5`. That is the whole
  composition: Mio ships no provider code.
- `test/` — a replay suite that boots the real composition against recorded MiMo responses.

```bash
bun run dev:runtime      # from the repo root
```

## Why there is no Mio adapter

There was one (`@mio/llm-mimo`, now under `archive/packages/`). Its justification was that MiMo
authenticates with an `api-key` header rather than `Authorization: Bearer`, which pi-ai cannot
send. That claim came from the archived Effect runtime's documentation and is **false**: measured
against the live API on 2026-08-22, MiMo accepts Bearer for non-streaming, streaming,
`reasoning_content`, and tool calls alike.

Riding the shipped adapter is not just less code. It is what puts MiMo on the web Models page with
a real API-key editor — `layoutOf()` in `dsh-client-ui-settings-models` keys on the *settings
namespace*, and a third-party namespace renders a read-only hint with no key input and a disabled
save button. It also inherits pi-ai's stream idle watchdog, retry policy, error classification,
`Retry-After` handling, and image pipeline rather than reimplementing each one — twelve gaps the
hand-written adapter had, four of which reported success while losing data.

## Supplying the MiMo API key

From the app: **Settings → 模型 → MiMo → 编辑**. The key is written through the credentials
service, never into a config file.

From the environment, which the credential reference resolves against:

```bash
MIO_API_KEY=<your key> bun run dev:runtime
```

## Selecting the billing track

MiMo has two billing tracks on separate endpoints. The composition ships pay-as-you-go
(`https://api.xiaomimimo.com/v1`). A token-plan account points `baseURL` at its region instead —
`https://token-plan-{cn,sgp,ams}.xiaomimimo.com/v1` — through the Models page's custom-settings
section, or in the profile's user settings (`$DSH_HOME/settings.yaml`), which is where a
deployment choice belongs rather than in the product composition.

One caveat if you reach for a second `--patch` overlay instead: a patch entry **replaces** the
provider object rather than merging into it, so an overlay setting only `baseURL` drops the
`models` list and the route fails to load with "resolves no models".

## Tests

```bash
cd packages/runtime && bun run test
```

A local server replays a cassette captured from the live API, the headless profile is booted
against it, and the assertion is on the answer a user would see. It is an integration test on
purpose: with no Mio adapter left to unit-test, what can still break is the composition — a dsh
upgrade changing pi-ai's config schema, a route or model id drifting, or pi-ai mishandling
something MiMo actually sends. The cassettes came from the archived adapter's suite, captured with
the key never recorded.

## Headless checks and the directory picker

`directory-picker-auto` resolves to the **native** OS dialog on a desktop session, which an
automated check cannot drive. To pick a workspace from inside the page, pin the browse pair with
an extra overlay (test-only — do not fold this into `mio.patch.yml`):

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: ui-directory-picker-browse
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

## Useful commands

```bash
bunx dsh --profile web --dump-default-config          # base profile tree
bunx dsh web --patch ./mio.patch.yml --dump-config    # tree with the Mio layer applied
```
