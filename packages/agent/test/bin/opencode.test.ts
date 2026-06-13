import { describe, expect, test } from "bun:test"
import path from "path"

describe("npm bin wrapper", () => {
  test("reports Mio platform packages when no binary is installed", async () => {
    const proc = Bun.spawn([process.execPath, path.join(import.meta.dir, "../../bin/opencode")], {
      env: {
        PATH: process.env.PATH ?? "",
      },
      stdout: "ignore",
      stderr: "pipe",
    })

    const stderr = await new Response(proc.stderr).text()

    expect(await proc.exited).toBe(1)
    expect(stderr).toInclude("Mio CLI")
    expect(stderr).toInclude("mio-")
    expect(stderr).not.toInclude("mimo-")
    expect(stderr).not.toInclude("opencode-")
  })

  test("keeps the Docker image entrypoint aligned with Mio binary names", async () => {
    const dockerfile = await Bun.file(path.join(import.meta.dir, "../../Dockerfile")).text()

    expect(dockerfile).toContain("dist/mio-linux-x64-baseline-musl/bin/mio")
    expect(dockerfile).toContain("dist/mio-linux-arm64-musl/bin/mio")
    expect(dockerfile).toContain("/usr/local/bin/mio")
    expect(dockerfile).toContain("RUN mio --version")
    expect(dockerfile).toContain('ENTRYPOINT ["mio"]')
    expect(dockerfile).not.toContain("dist/mimo-")
    expect(dockerfile).not.toContain("dist/opencode-")
    expect(dockerfile).not.toContain('ENTRYPOINT ["mimo"]')
    expect(dockerfile).not.toContain('ENTRYPOINT ["opencode"]')
  })
})
