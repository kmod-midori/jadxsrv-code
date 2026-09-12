import * as vscode from 'vscode';
import { fetchJson, JadxLocation, postJson } from './utils';

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
