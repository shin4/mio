# Security

Mio is a local AI coding agent with access to powerful tools such as file
operations, shell commands, local servers, and configured MCP tools. Treat it as
software that can act with the permissions of the user running it.

## Threat Model

Mio does not provide a security sandbox. Permission prompts and approval
flows help users understand and confirm actions, but they are not isolation
boundaries. If you need strong isolation, run Mio in a container, VM, or
other restricted environment.

Server mode is opt-in. When enabling it, configure authentication with
`MIO_SERVER_PASSWORD`. Mio does not read upstream `OPENCODE_*`
environment variables by default, which prevents an upstream OpenCode shell
configuration from silently affecting Mio. Exposing an unauthenticated
server is an operator error, not a product vulnerability.

## Out of Scope

| Category | Rationale |
| --- | --- |
| Server access when server mode is intentionally enabled | API access is expected behavior for that mode. |
| Sandbox escapes | Mio is not a sandbox. |
| Provider-side data handling | Data sent to configured LLM providers is governed by those providers. |
| MCP server behavior | External MCP servers are outside the Mio trust boundary. |
| User-controlled config files | Users control their local configuration. |

## Reporting

Use the Mio repository issue tracker or private security channel selected
by the maintainers for security reports. Include clear reproduction steps,
affected versions or commits, and the local configuration needed to reproduce.
