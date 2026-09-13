import * as vscode from 'vscode';
import { nanoid } from 'nanoid';
import { fetchJson, JadxLocation, JSONStreamer, postJson } from './utils';

interface DefinitionResponse {
    def: JadxLocation | null;
}

const baseUrl = 'http://127.0.0.1:28080';

interface RenameResponse {
    location: JadxLocation;
    name: string;
    /** Set only when a top-level class was renamed and its file moved. */
    oldLocation: JadxLocation | null;
}

interface RenameInfoResponse {
    canRename: boolean;
    name: string | null;
}

export async function fetchRenameInfo(path: string, offset: number): Promise<RenameInfoResponse> {
    return fetchJson(`${baseUrl}/rename/${path}?offset=${offset}`, null);
}

export async function renameSymbol(path: string, offset: number, name: string): Promise<RenameResponse> {
    return postJson(`${baseUrl}/rename/${path}?offset=${offset}`, { name });
}

export async function fetchDefinition(path: string, offset: number, token: vscode.CancellationToken | null): Promise<DefinitionResponse> {
    const url = `${baseUrl}/definition/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

interface RefsResponse {
    refs: JadxLocation[];
}

export async function fetchRefs(path: string, offset: number, token: vscode.CancellationToken | null): Promise<RefsResponse> {
    const url = `${baseUrl}/refs/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

interface AnnotationResponse {
    content: string | null;
}

export async function fetchAnnotation(path: string, offset: number, token: vscode.CancellationToken | null): Promise<AnnotationResponse> {
    const url = `${baseUrl}/annotation/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

interface OutlineResponse {
    root: Symbol | null;
}

export interface Symbol {
    name: string;
    detail: string;
    kind: vscode.SymbolKind;
    byteOffset: number | null;
    children: Symbol[];
}

export async function fetchOutline(path: string, token: vscode.CancellationToken | null): Promise<OutlineResponse> {
    const url = `${baseUrl}/outline/${path}`;
    return await fetchJson(url, token);
}

interface ReadDirResponse {
    dirs: string[];
    files: string[];
}

export async function fetchReadDir(path: string, token: vscode.CancellationToken | null): Promise<ReadDirResponse> {
    const url = `${baseUrl}/ls/${path}`;
    return await fetchJson(url, token);
}

export interface CallHierarchyItem {
    name: string;
    detail: string;
    kind: vscode.SymbolKind;
    location: JadxLocation;
    /** Byte offset of the declaration in the location's file */
    offset: number;
}

interface CallHierarchyPrepareResponse {
    item: CallHierarchyItem | null;
}

export interface CallHierarchyCall {
    item: CallHierarchyItem;
    callOffsets: number[];
}

interface CallHierarchyCallsResponse {
    calls: CallHierarchyCall[];
}

export async function fetchCallHierarchyItem(path: string, offset: number, token: vscode.CancellationToken | null): Promise<CallHierarchyPrepareResponse> {
    const url = `${baseUrl}/callhierarchy/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export async function fetchCallHierarchyIncoming(path: string, offset: number, token: vscode.CancellationToken | null): Promise<CallHierarchyCallsResponse> {
    const url = `${baseUrl}/callhierarchy/incoming/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export async function fetchCallHierarchyOutgoing(path: string, offset: number, token: vscode.CancellationToken | null): Promise<CallHierarchyCallsResponse> {
    const url = `${baseUrl}/callhierarchy/outgoing/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export interface TypeHierarchyItem {
    name: string;
    detail: string;
    kind: vscode.SymbolKind;
    location: JadxLocation;
    /** Byte offset of the class declaration in the location's file */
    offset: number;
}

interface TypeHierarchyPrepareResponse {
    item: TypeHierarchyItem | null;
}

interface TypeHierarchyResponse {
    items: TypeHierarchyItem[];
}

export async function fetchTypeHierarchyItem(path: string, offset: number, token: vscode.CancellationToken | null): Promise<TypeHierarchyPrepareResponse> {
    const url = `${baseUrl}/typehierarchy/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export async function fetchTypeHierarchySupertypes(path: string, offset: number, token: vscode.CancellationToken | null): Promise<TypeHierarchyResponse> {
    const url = `${baseUrl}/typehierarchy/supertypes/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export async function fetchTypeHierarchySubtypes(path: string, offset: number, token: vscode.CancellationToken | null): Promise<TypeHierarchyResponse> {
    const url = `${baseUrl}/typehierarchy/subtypes/${path}?offset=${offset}`;
    return await fetchJson(url, token);
}

export interface SearchSymbol {
    name: string;
    containerName: string;
    kind: vscode.SymbolKind;
    detail: string;
    location: JadxLocation;
}

/**
 * Promise wrapper around the streaming /search endpoint: collect items until
 * the stream ends. Cancellation aborts the fetch and cancels the task
 * server-side, mirroring the Find Anything quick pick.
 */
export async function searchSymbols(query: string, types: string[], limit: number, token: vscode.CancellationToken | null): Promise<SearchSymbol[]> {
    const taskId = nanoid();
    const url = `${baseUrl}/search/${taskId}?types=${encodeURIComponent(types.join(','))}&limit=${limit}&ignoreCase=true&query=${encodeURIComponent(query)}`;
    const streamer = new JSONStreamer<SearchSymbol>(url, { method: 'POST' });
    token?.onCancellationRequested(() => {
        streamer.cancel();
        fetch(`${baseUrl}/search/${taskId}`, { method: 'DELETE' }).catch((err) => {
            console.error(`Error cancelling search task ${taskId}`, err);
        });
    });

    const items: SearchSymbol[] = [];
    return new Promise<SearchSymbol[]>((resolve, reject) => {
        streamer.onItem(item => {
            if (item) {
                items.push(item);
            } else {
                resolve(items);
            }
        });
        streamer.start().catch((err) => {
            if (err.name === 'AbortError') {
                resolve(items);
                return;
            }
            reject(err);
        });
    });
}
