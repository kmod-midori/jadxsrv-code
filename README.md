# JADX for VS Code

This VS Code extension exposes content decompiled by
[jadxsrv](../jadxsrv) as a read-only `jadx:` filesystem. It provides
go-to-definition, references, hover information, document symbols, and search
for decompiled source.

## Getting started

Start `jadxsrv` with the APK, JAR, or DEX inputs to decompile:

```bash
cd ../jadxsrv
./gradlew run --args="/absolute/path/to/app.apk"
```

Install and launch this extension, then run **JADX: Open Decompiled Files** from
the Command Palette. The extension opens `jadx:/` and connects to the server at
`http://127.0.0.1:28080`.

The server owns the decompiler lifecycle and input selection. To decompile
different files, restart `jadxsrv` with the new input paths before reopening the
JADX workspace.

## Development

```bash
npm ci
npm run compile
npm run lint
```

Use the **Launch Extension** configuration to open an Extension Development
Host. Keep `jadxsrv` running with test inputs while exercising the extension.
