# jadx VS Code extension

This project is a TypeScript VS Code extension that exposes files decompiled by
the sibling `jadxsrv` Ktor server through the read-only `jadx:` filesystem
scheme. The extension expects that server at `http://127.0.0.1:28080`.

## Build and lint

- Install dependencies: `npm ci`
- Compile: `npm run compile`
- Lint: `npm run lint`
- Watch while developing: `npm run watch`

There are no automated test scripts. Use VS Code's Extension Development Host
to exercise filesystem, definition, reference, hover, outline, search, and
symbol renaming behaviour against a running `jadxsrv` server.

## Project layout

- `src/extension.ts` activates the extension, registers the `jadx` filesystem
  provider and language providers, and implements commands.
- `src/jadxFsProvider.ts` maps VS Code filesystem operations to the server's
  `stat`, `ls`, and `read` endpoints. The scheme is intentionally read-only.
- `src/api.ts` defines typed client functions for navigation and outline
  endpoints.
- `src/providers.ts` translates server responses into VS Code definition,
  references, hover, document-symbol, and call-hierarchy provider results.
  The call-hierarchy provider round-trips item identity (class path +
  declaration byte offset) through a `WeakMap` because `CallHierarchyItem.data`
  requires VS Code 1.89 and this package targets 1.83; ranges are derived
  client-side from offsets via `document.positionAt()`.
- `src/utils.ts` owns URI encoding/parsing, fetch handling, location-to-URI
  conversion, and NDJSON search streaming.
- `package.json` declares activation, contributed commands, and the npm
  scripts; keep it consistent with registrations in `extension.ts`.

## Conventions

- Use TypeScript with the existing strict compiler settings; avoid `any` and
  preserve nullability in server response types.
- Follow the local style in the file being changed. Source files currently use
  both tabs and spaces, so do not reformat unrelated code.
- Build `jadx:` URIs with `makeUri()` and parse them with `extractFromUri()`;
  preserve the root-scoped format `jadx:/<virtual-path>`.
- The server receives input paths only at startup. Do not add input paths,
  input-selection state, or decompiler identity to extension URIs or request
  URLs.
- Keep network access cancellable when VS Code supplies a
  `CancellationToken`, using `fetchJson()` or an equivalent `AbortController`
  pattern.
- Check failed `fetch` responses and map filesystem failures to appropriate
  `vscode.FileSystemError` values instead of returning partial data.
- Register disposables through `context.subscriptions` in `activate()`.
- Treat data returned by the local server as untrusted: preserve URI encoding
  and do not widen trusted Markdown/HTML handling without an explicit need.
- The `jadx.renameSymbol` editor command sends a cursor offset and alias to the
  server. It must reopen the URI returned for class aliases, and emit filesystem
  change events so Explorer and documents refresh; empty input resets an alias.
  `JadxFs.notifyRenamed()` fires a change event for every open `jadx:` document,
  not just the edited one, because a rename can rewrite call sites in other
  classes; the read-only scheme means those documents are never dirty, so VS
  Code reloads them from the provider automatically.
- The streamed search endpoint returns newline-delimited JSON. Preserve partial
  chunks until a newline is received and use its `DELETE` endpoint to cancel
  active server-side searches.

## Cross-project API contract

Coordinate endpoint or response-schema changes with the sibling `jadxsrv`
project. This extension consumes `ls`, `stat`, `read`, `annotation`,
`definition`, `refs`, `outline`, `rename`, `callhierarchy`, and streaming
`search` endpoints, and assumes the server's LSP-style line/character
positions and symbol kinds.
