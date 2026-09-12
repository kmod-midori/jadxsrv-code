import * as vscode from 'vscode';
import * as api from './api';
import { extractFromUri, jadxLocationToUri } from './utils';

export class JadxDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        const { path } = extractFromUri(document.uri);
        let customRegex: RegExp | undefined = undefined;
        if (document.languageId === 'xml') {
            customRegex = /[a-zA-Z0-9.]+/;
        }
        const wordRange = document.getWordRangeAtPosition(position, customRegex);
        const offset = document.offsetAt(wordRange?.start || position);
        const response = await api.fetchDefinition(path, offset, token);
        if (response.def) {
            const fileUri = jadxLocationToUri(response.def);
            if (response.def.position === null) {
                return new vscode.Location(fileUri, new vscode.Position(0, 0));
            }
            return new vscode.Location(fileUri, new vscode.Position(response.def.position.line, response.def.position.character));
        }
        return [];
    }
}

export class JadxReferenceProvider implements vscode.ReferenceProvider {
    async provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken): Promise<vscode.Location[]> {
        const { path } = extractFromUri(document.uri);
        const offset = document.offsetAt(document.getWordRangeAtPosition(position)?.start || position);
        const response = await api.fetchRefs(path, offset, token);

        const res = [];
        for (const ref of response.refs) {
            const fileUri = jadxLocationToUri(ref);
            if (ref.position === null) {
                res.push(new vscode.Location(fileUri, new vscode.Position(0, 0)));
            } else {
                res.push(new vscode.Location(fileUri, new vscode.Position(ref.position.line, ref.position.character)));
            }
        }

        return res;
    }
}

export class JadxHoverProvider implements vscode.HoverProvider {
    async provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover | null> {
        const { path } = extractFromUri(document.uri);
        let customRegex: RegExp | undefined = undefined;
        if (document.languageId === 'xml') {
            customRegex = /[a-zA-Z0-9.]+/;
        }
        const wordRange = document.getWordRangeAtPosition(position, customRegex);
        const offset = document.offsetAt(wordRange?.start || position);
        const response = await api.fetchAnnotation(path, offset, token);

        const content = response.content;
        if (content) {
            const markdownString = new vscode.MarkdownString(content);
            markdownString.isTrusted = true; // Allow HTML content
            return new vscode.Hover(markdownString, wordRange);
        } else {
            return null;
        }
    }
}

export class JadxDocumentSymbol implements vscode.DocumentSymbolProvider {
    convertSymbol(document: vscode.TextDocument, symbol: api.Symbol): vscode.DocumentSymbol {
        const pos = document.positionAt(symbol.byteOffset || 0);
        const range = new vscode.Range(pos, pos);
        const ret = new vscode.DocumentSymbol(
            symbol.name,
            symbol.detail,
            symbol.kind,
            range,
            range,
        );
        ret.children = symbol.children.map(child => this.convertSymbol(document, child));
        return ret;
    }

    async provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        const { path } = extractFromUri(document.uri);
        const response = await api.fetchOutline(path, token);
        if (response.root) {
            return [this.convertSymbol(document, response.root)];
        }
        return [];
    }
}
