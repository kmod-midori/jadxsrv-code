import * as vscode from 'vscode';
import * as api from './api';
import { extractFromUri } from './utils';

class JadxFileStat implements vscode.FileStat {
    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;

    constructor(type: vscode.FileType, ctime: number, mtime: number, size: number) {
        this.type = type;
        this.ctime = ctime;
        this.mtime = mtime;
        this.size = size;
    }
}

const baseUrl = 'http://127.0.0.1:28080';

export class JadxFs implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    notifyRenamed(oldUri: vscode.Uri, newUri: vscode.Uri): void {
        const events: vscode.FileChangeEvent[] = [
            { type: vscode.FileChangeType.Changed, uri: vscode.Uri.parse('jadx:/classes') },
        ];
        if (oldUri.toString() === newUri.toString()) {
            events.push({ type: vscode.FileChangeType.Changed, uri: oldUri });
        } else {
            events.push(
                { type: vscode.FileChangeType.Deleted, uri: oldUri },
                { type: vscode.FileChangeType.Created, uri: newUri },
            );
        }
        // Reload all other tabs
        for (const doc of vscode.workspace.textDocuments) {
            const docUri = doc.uri.toString();
            if (doc.uri.scheme === 'jadx' && docUri !== oldUri.toString() && docUri !== newUri.toString()) {
                events.push({ type: vscode.FileChangeType.Changed, uri: doc.uri });
            }
        }
        this._emitter.fire(events);
    }

    watch(_uri: vscode.Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const { path } = extractFromUri(uri);
        const url = `${baseUrl}/stat/${path}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw vscode.FileSystemError.FileNotFound();
        }
        const data = await response.json() as JadxFileStat;
        return data;
    }

    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const { path } = extractFromUri(uri);
        const data = await api.fetchReadDir(path, null);

        const entries: [string, vscode.FileType][] = [];
        for (const dirName of data.dirs) {
            entries.push([dirName, vscode.FileType.Directory]);
        }
        for (const fileName of data.files) {
            entries.push([fileName, vscode.FileType.File]);
        }

        return entries;
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const { path } = extractFromUri(uri);
        const url = `${baseUrl}/read/${path}`;
        const response = await fetch(url);
        if (response.status === 404) {
            throw vscode.FileSystemError.FileNotFound();
        }
        if (!response.ok) {
            throw vscode.FileSystemError.Unavailable();
        }
        const rawData = await response.arrayBuffer();
        const data = new Uint8Array(rawData);
        return data;
    }

    writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { readonly create: boolean; readonly overwrite: boolean; }): void {
        throw vscode.FileSystemError.Unavailable();
    }
    delete(_uri: vscode.Uri, _options: { readonly recursive: boolean; }): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable();
    }
    rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { readonly overwrite: boolean; }): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable();
    }
    createDirectory(_uri: vscode.Uri): void | Thenable<void> {
        throw vscode.FileSystemError.Unavailable();
    }
}
