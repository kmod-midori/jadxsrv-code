# JADX for VS Code

Browse and analyze Android apps decompiled by [jadx](https://github.com/skylot/jadx)
directly inside VS Code.

This extension is the client half of a small client/server setup: the sibling
`jadxsrv` server wraps jadx and exposes a decompiled APK, DEX, or
JAR as a read-only `jadx:` virtual filesystem over HTTP. This extension mounts
that filesystem in VS Code and layers full IDE navigation on top of it.

## Why not jadx-gui?

The official [jadx-gui](https://github.com/skylot/jadx) is a standalone Swing application. This
project reuses the same decompiler core, but moves the browsing experience into
your editor:

| | jadx-gui (official) | this extension |
|---|---|---|
| UI | Dedicated Swing app | VS Code, your theme, fonts, and keybindings |
| Go to declaration | Yes | Yes (`F12` / Ctrl+Click) |
| Find usages | Yes | Yes (VS Code references, `X` on a symbol) |
| Full text / symbol search | Yes, in-app dialogs | **Find Anything** quick pick — live, streamed results for classes, methods, fields, and text |
| Call hierarchy | No | Yes, incoming and outgoing calls (`C` on a method) |
| Type hierarchy | No | Yes, supertypes and subtypes (`T` on a class) |
| Hover info | Limited | Type and signature hovers in Java and XML |
| Outline / breadcrumbs | Class tree in a side panel | VS Code document symbols, outline view, breadcrumbs |
| Symbol renaming (deobfuscation) | Yes, persisted per project | Yes (`N` on a symbol), in-memory aliases on the server |
| Editing / refactoring UX | Fixed dialogs | Split editors, peek views, multi-cursor, Vim/emacs modes, git — everything VS Code offers |
| Smali debugger | Yes | No |
| Decompiler settings | Adjustable live in the UI | Fixed when the server starts |

The trade-off: you get VS Code's editing ergonomics and ecosystem, at the cost
of GUI-only features like the smali debugger and live settings tweaks.

## Features

- **`jadx:` filesystem** — the decompiled app appears as a normal folder tree
  (`classes/` and `resources/`) in the Explorer, openable like any workspace.
- **Go to definition** — works across classes, and from `AndroidManifest.xml`
  and other XML resources into decompiled code.
- **Find references** — select a symbol and press `X`.
- **Call hierarchy** — press `C` on a method for incoming/outgoing calls.
- **Type hierarchy** — press `T` on a class or interface to walk supertype
  (extends/implements) and subtype (implementations/overrides) chains in VS
  Code's type hierarchy view; works on class references in XML resources too.
- **Hover** — signatures, types, and documentation.
- **Document symbols** — outline view and breadcrumbs for each decompiled class.
- **Find Anything** (`JADX: Find Anything`) — fuzzy search over classes,
  methods, fields, and text, with case-sensitivity options; results stream in
  as the server finds them, and stale searches are cancelled server-side as you
  type.
- **Rename symbol** (`JADX: Rename Symbol`, `N` on a symbol) — assign a
  readable alias to an obfuscated class, method, or field. Renames update call
  sites across all classes; an empty name resets the alias. Aliases live in
  server memory and reset when `jadxsrv` restarts.

## Installing the extension

Every push builds a `.vsix` package and uploads it as the
`jadxsrv-code-vsix` workflow artifact (see the Actions tab). Download it and
install with:

```bash
code --install-extension extension.vsix
```

## Development

```bash
npm ci
npm run compile
npm run lint
```

Use the **Launch Extension** configuration to open an Extension Development
Host. Keep `jadxsrv` running with test inputs while exercising the extension.
