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

export async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Failed to post JSON to ${url}: ${await response.text()}`);
    }

    return response.json() as T;
}

/**
 * URI format: `jadx:/path/to/file`
 */
export function extractFromUri(uri: vscode.Uri): { path: string } {
    return { path: uri.path.replace(/^\/+/, '') };
}

export function makeUri(path: string): vscode.Uri {
    return vscode.Uri.parse(`jadx:/${path}`);
}

export interface JadxLocation {
    topPackageName: string;
    topClassName: string;
    /** Omitted by the server when the symbol has no position (McpJson drops null fields). */
    position?: { line: number; character: number; };
}

export function jadxLocationToUri(location: JadxLocation): vscode.Uri {
    const path = `classes/${location.topPackageName.replace(/\./g, '/')}/${location.topClassName}.java`;
    return makeUri(path);
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
