import * as vscode from 'vscode';

export async function fetchJson<T>(url: string, cancelToken: vscode.CancellationToken | null): Promise<T> {
    const abortController = new AbortController();
    const fetchParams: RequestInit = {
        headers: {
            'Accept': 'application/json'
        },
    };

    if (cancelToken) {
        cancelToken.onCancellationRequested(() => {
            abortController.abort();
        });
        fetchParams.signal = abortController.signal;
    }

    const response = await fetch(url, fetchParams);
    if (!response.ok) {
        throw new Error(`Failed to fetch JSON from ${url}: ${response.statusText}`);
    }

    return response.json() as T;
}

export function urlSafeBase64Encode(str: string): string {
    return Buffer.from(str, 'utf-8').toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * URI format: `jadx:encodedFilePath/originalFileName/path/to/file`
 * @param uri The URI to extract the file path and path from.
 */
export function extractFromUri(uri: vscode.Uri): { encodedFilePath: string, fileName: string, path: string } {
    const pathParts = uri.path.split('/');
    const encodedFilePath = pathParts[1];
    const fileName = pathParts[2];
    const path = pathParts.slice(3).join('/');
    return { encodedFilePath, fileName, path };
}

export function makeUri(encodedFilePath: string, fileName: string, path: string): vscode.Uri {
    return vscode.Uri.parse(`jadx:/${encodedFilePath}/${fileName}/${path}`);
}

export interface JadxLocation {
    topPackageName: string;
    topClassName: string;
    position: { line: number; character: number; } | null;
}

export function jadxLocationToUri(location: JadxLocation, encodedFilePath: string, fileName: string): vscode.Uri {
    const path = `classes/${location.topPackageName.replace(/\./g, '/')}/${location.topClassName}.java`;
    return makeUri(encodedFilePath, fileName, path);
}

export class JSONStreamer<T> {
    private _itemEvent = new vscode.EventEmitter<T | null>();

    private url: string;
    private init?: RequestInit;
    private abortController = new AbortController();

    public onItem: vscode.Event<T | null> = this._itemEvent.event;

    constructor(url: string, init?: RequestInit) {
        this.url = url;
        this.init = init;
    }

    async start(): Promise<void> {
        const response = await fetch(this.url, {
            signal: this.abortController.signal,
            ...this.init,
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch JSON from ${this.url}: ${response.statusText}`);
        }
        if (!response.body) {
            throw new Error(`Response body is null for ${this.url}`);
        }

        const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
        let buffer = '';
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (value) {
                    buffer += decoder.decode(value, { stream: false });
                }
                buffer = this.parseBufferAndEmit(buffer);
                this._itemEvent.fire(null); // Signal end of stream
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            buffer = this.parseBufferAndEmit(buffer);
        }
    }

    private parseBufferAndEmit(buffer: string): string {
        while (true) {
            const endIndex = buffer.indexOf('\n');
            if (endIndex === -1) {
                break;
            }
            const line = buffer.slice(0, endIndex);
            buffer = buffer.slice(endIndex + 1);
            const item: T = JSON.parse(line);
            this._itemEvent.fire(item);
        }
        return buffer;
    }

    cancel(): void {
        this.abortController.abort();
    }
}