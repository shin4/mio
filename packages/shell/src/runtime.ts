/**
 * The dsh runtime as a child process of the desktop shell.
 *
 * The shell owns no agent logic: it starts `dsh web` with Mio's patch layer,
 * learns the URL the runtime chose, and hands that to a window. Port 0 lets the
 * OS pick a free port, so two Mio windows (or a stray `dev:runtime`) never
 * collide; the runtime prints the port it settled on and this module parses it.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

/** Time to wait for the runtime to announce its URL before giving up. */
const READY_TIMEOUT_MS = 60_000

/** `dsh web: http://127.0.0.1:53124` (a LAN hint may follow, and is ignored). */
const URL_LINE = /dsh web:\s*(http:\/\/\S+)/

export interface RuntimeHandle {
  /** Local URL the dsh web UI is served from. */
  readonly url: string
  /** Terminate the runtime; resolves once the process is gone. */
  stop(): Promise<void>
}

export interface RuntimeOptions {
  /** `$DSH_HOME` — holds profiles, sessions, and settings. */
  readonly dshHome: string
  /** Directory the patch path resolves against; also the runtime's cwd. */
  readonly cwd: string
  /** Mio's patch-list overlay over the dsh `web` profile. */
  readonly patch: string
  /** Receives runtime stdout/stderr lines for the shell's own logging. */
  readonly onLog?: (line: string) => void
}

/**
 * Resolve dsh's CLI entry from this package's dependency, not from $PATH.
 *
 * In a packaged build `require.resolve` lands inside `app.asar`, which the
 * spawned child cannot read as ordinary files; the real tree is the unpacked
 * twin beside it, so the path is redirected there.
 */
function dshBin(): string {
  const require = createRequire(import.meta.url)
  const pkg = path.dirname(require.resolve("@deepseek-ai/dsh/package.json"))
  return path.join(pkg.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`), "lib", "bin.js")
}

/**
 * Start the runtime and resolve once it reports its URL.
 *
 * Rejects — after killing the child — if the runtime exits first, prints
 * nothing within {@link READY_TIMEOUT_MS}, or fails to spawn at all. The
 * rejection carries the tail of the runtime's own output, because that text is
 * the only useful diagnosis (a missing profile, a bad patch entry, a port
 * refusal) and the shell has none of its own.
 */
export function startRuntime(options: RuntimeOptions): Promise<RuntimeHandle> {
  // Electron's bundled Node runs the CLI, so the shell needs no system Node.
  //
  // `--expose-internals` is required, not a convenience: dsh reaches Node's ESM
  // loader either through this flag or through the `node-addon-require-builtin`
  // native addon, and that addon is built for Node's ABI, not Electron's. Without
  // the flag the loader silently falls back to resolving plugin entries from its
  // own location (so profile plugins vanish) and the HMR service refuses to start.
  // `--no-open`: since rc.8 the runtime opens the Web UI in the system browser
  // by default. The shell already shows that UI in its own window, so a browser
  // tab on every launch would be a second, stray copy of the app.
  const args = ["--expose-internals", dshBin(), "web", "--patch", options.patch, "--port", "0", "--no-open"]
  const child = spawn(process.execPath, args, {
    cwd: options.cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", DSH_HOME: options.dshHome },
    stdio: ["ignore", "pipe", "pipe"],
  })

  return new Promise<RuntimeHandle>((resolve, reject) => {
    const recent: string[] = []
    let settled = false

    const finish = (outcome: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      outcome()
    }

    const fail = (reason: string) => {
      finish(() => {
        child.kill()
        reject(new Error(`${reason}\n${recent.join("\n")}`.trim()))
      })
    }

    const timer = setTimeout(() => fail("dsh runtime did not report a URL in time."), READY_TIMEOUT_MS)

    const read = (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim()) continue
        options.onLog?.(line)
        // Keep a bounded tail: enough to diagnose a failure, never a full log.
        recent.push(line)
        if (recent.length > 40) recent.shift()

        const url = URL_LINE.exec(line)?.[1]
        if (url) finish(() => resolve({ url, stop: () => stop(child) }))
      }
    }

    child.stdout.on("data", read)
    child.stderr.on("data", read)
    child.on("error", (cause) => fail(`Failed to start the dsh runtime: ${cause.message}`))
    child.on("exit", (code, signal) =>
      fail(`The dsh runtime exited before it was ready (code ${code ?? "null"}, signal ${signal ?? "none"}).`),
    )
  })
}

/** Ask the runtime to exit, escalating to SIGKILL if it ignores the request. */
function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const escalate = setTimeout(() => child.kill("SIGKILL"), 5_000)
    child.once("exit", () => {
      clearTimeout(escalate)
      resolve()
    })
    child.kill("SIGTERM")
  })
}
