# Security and privacy

## Trust model

This tool gives an authorized local MCP client the ability to read and edit the Figma Design file whose development plugin is open. The AI provider may receive design content returned by the MCP client; **local transport does not mean the entire AI workflow is offline**. Use only files and clients you trust and are allowed to share with that provider.

- HTTP/WebSocket bridge binds only to `127.0.0.1`. It is not an internet service and must not be exposed by tunnels, proxies or a `0.0.0.0` bind.
- A random 256-bit token pairs local clients and the plugin. HTTP requests require Bearer authentication and must not include a browser Origin header. WebSocket upgrades accept only the expected path and absent/null/Figma origins, then require token authentication.
- One plugin connection is accepted at a time. Commands are serialized and bounded. Each command targets a plugin-run session ID, checked again inside the Figma sandbox.
- No arbitrary JavaScript execution, external image fetching, telemetry or cloud API calls are implemented. The plugin's development network allowlist contains only its local WebSocket address.
- The token is shared by processes with access to the local state directory. This is not isolation against a malicious program running as your OS user, and not a multi-user hosted-service security boundary.

## Private files and sharing

`.local/settings.json` and the generated `dist/ui.html` contain pairing credentials. Logs, status output and previews can reveal file names, session IDs or design content. Git and npm ignore rules exclude generated state, but **manually zipping the working folder bypasses those rules**. Share a Git source archive and inspect it before sending. Every recipient must build locally and generate a different token.

POSIX state directory/file permissions are restricted to 0700/0600 when created. On Windows, protect the folder with appropriate user ACLs; POSIX mode flags are not equivalent to Windows access control. Do not put the state directory on a public/shared drive.

## Recovery

Closing the plugin stops access to that file. Disable the MCP client entry and run `npm run stop` to stop the shared bridge; active commands must finish first. To rotate a compromised pairing token, stop the bridge, replace the token in the private settings file with a freshly generated 32-byte hexadecimal value, rebuild and reopen the plugin. Never post the token to troubleshoot.

An error or timeout is not proof that a write did nothing. Inspect the actual file before reconnecting or retrying. The creation rollback is best-effort; not all operations are transactional. Figma Undo is available.

## Reporting

Do not put credentials, private designs or exploit details into a public issue. Use the repository's private vulnerability-reporting channel if its owner has enabled one; otherwise contact the repository owner privately first. No hosted security inbox or response-time guarantee is provided by this source distribution.
