import * as vscode from 'vscode';
import { JadxFs } from './jadxFsProvider';
import * as providers from './providers';
import { extractFromUri, fetchJson, JadxLocation, jadxLocationToUri, JSONStreamer, makeUri, urlSafeBase64Encode } from './utils';
import { nanoid } from 'nanoid';

function openUris(uris?: vscode.Uri[]) {
	if (!uris || uris.length === 0) {
		return;
	}

	const encodedFsPaths = uris.map((file) => urlSafeBase64Encode(file.fsPath));

	vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(`jadx:/${encodedFsPaths.join(';')}/input.apk/`), false);
	vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
	vscode.commands.executeCommand('workbench.view.explorer');
}

function addUris(currentUri: vscode.Uri, uris?: vscode.Uri[]) {
	if (!uris || uris.length === 0) {
		return;
	}

	const encodedFsPaths = uris.map((file) => urlSafeBase64Encode(file.fsPath));

	const { encodedFilePath: originalPaths } = extractFromUri(currentUri);

	vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(`jadx:/${originalPaths};${encodedFsPaths.join(';')}/input.apk/`), false);
	vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
	vscode.commands.executeCommand('workbench.view.explorer');
}

async function selectFiles(): Promise<vscode.Uri[] | undefined> {
	return await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: true,
		filters: {
			"Supported Files (apk, dex, jar, zip)": ["apk", "dex", "jar", "zip", "class", "smali"],
		}
	});
}

async function selectFolders(): Promise<vscode.Uri[] | undefined> {
	return await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: true,
	});
}

interface SearchResponse {
	symbols: WorkspaceSymbol[];
}

interface WorkspaceSymbol {
	name: string;
	containerName: string;
	detail: string;
	kind: vscode.SymbolKind;
	location: JadxLocation;
}

function symbolKindToIcon(kind: vscode.SymbolKind): string {
	switch (kind) {
		case vscode.SymbolKind.File:
			return 'symbol-file';
		case vscode.SymbolKind.Class:
			return 'symbol-class';
		case vscode.SymbolKind.Method:
			return 'symbol-method';
		case vscode.SymbolKind.Field:
			return 'symbol-field';
		case vscode.SymbolKind.Interface:
			return 'symbol-interface';
		default:
			return 'symbol-misc';
	}
}

class SearchPickItem implements vscode.QuickPickItem {
	label: string;
	description: string;
	iconPath: vscode.IconPath;
	detail: string;
	uri: vscode.Uri;
	position: vscode.Position;

	constructor(encodedFilePath: string, fileName: string, item: WorkspaceSymbol) {
		this.label = item.name;
		this.description = item.containerName;
		this.iconPath = new vscode.ThemeIcon(symbolKindToIcon(item.kind));
		this.detail = item.detail;
		this.uri = jadxLocationToUri(item.location, encodedFilePath, fileName);
		if (item.location.position) {
			this.position = new vscode.Position(item.location.position.line, item.location.position.character);
		} else {
			this.position = new vscode.Position(0, 0);
		}
	}
}

class NoResultPickItem implements vscode.QuickPickItem {
	label = 'No results found';
	description = '';
	iconPath = new vscode.ThemeIcon('error');
	detail = '';
}

class SearchTypeItem implements vscode.QuickPickItem {
	label: string;
	picked: boolean;
	value: string;

	constructor(label: string, value: string, picked: boolean) {
		this.label = label;
		this.value = value;
		this.picked = picked;
	}
}

class CaseSensitivityItem implements vscode.QuickPickItem {
	label: string;
	picked: boolean;
	ignoreCase: boolean;

	constructor(label: string, value: boolean, picked: boolean) {
		this.label = label;
		this.ignoreCase = value;
		this.picked = picked;
	}
}

class SearchPickButton implements vscode.QuickInputButton {
	iconPath: vscode.ThemeIcon;
	tooltip: string;
	action: string;

	constructor(icon: string, tooltip: string, action: string) {
		this.iconPath = new vscode.ThemeIcon(icon);
		this.tooltip = tooltip;
		this.action = action;
	}
}

async function findAnything(uri: vscode.Uri) {
	const { encodedFilePath, fileName } = extractFromUri(uri);

	const searchTypes: SearchTypeItem[] = [
		new SearchTypeItem('Class', 'class', true),
		new SearchTypeItem('Method', 'method', true),
		new SearchTypeItem('Field', 'field', false),
		new SearchTypeItem('Text', 'text', false),
	];
	const pickedTypes = await vscode.window.showQuickPick(searchTypes, {
		title: 'What to search for?',
		canPickMany: true,
	});
	if (!pickedTypes) {
		return;
	}

	const caseSensitivityOptions: CaseSensitivityItem[] = [
		new CaseSensitivityItem('Case Sensitive', false, false),
		new CaseSensitivityItem('Case Insensitive', true, true),
	];
	const pickedCaseSensitivity = await vscode.window.showQuickPick(caseSensitivityOptions, {
		title: 'Case sensitivity',
		canPickMany: false,
	});
	if (!pickedCaseSensitivity) {
		return;
	}

	const searchPick = vscode.window.createQuickPick<SearchPickItem | NoResultPickItem>();
	searchPick.placeholder = 'Find anything';
	searchPick.ignoreFocusOut = true;
	searchPick.buttons = [
		new SearchPickButton('stop', 'Stop', 'stop'),
	];

	const types = pickedTypes.map((item) => item.value).join(',');
	let queryParams = `types=${encodeURIComponent(types)}&limit=200`;
	if (pickedCaseSensitivity.ignoreCase) {
		queryParams += '&ignoreCase=true';
	}
	const baseUrl = `http://127.0.0.1:28080/${encodedFilePath}/search`;

	let currentStreamer: JSONStreamer<WorkspaceSymbol> | null = null;
	let currentTaskId: string | null = null;

	function cancelCurrent() {
		currentStreamer?.cancel();
		if (currentTaskId) {
			const cancelUrl = `${baseUrl}/${currentTaskId}`;
			fetch(cancelUrl, { method: 'DELETE' }).catch((err) => {
				console.error(`Error cancelling previous search task ${currentTaskId}`, err);
			});
		}
		searchPick.busy = false;
	}

	searchPick.onDidChangeValue(async (value) => {
		cancelCurrent();
		searchPick.items = [];

		const taskId = nanoid();
		const url = `${baseUrl}/${taskId}?${queryParams}&query=${encodeURIComponent(value)}`;

		currentStreamer = new JSONStreamer(url, {
			method: 'POST',
		});
		currentTaskId = taskId;

		searchPick.busy = true;
		currentStreamer.onItem((item) => {
			if (item) {
				const searchItem = new SearchPickItem(encodedFilePath, fileName, item);
				searchPick.items = [...searchPick.items, searchItem];
			} else {
				if (searchPick.items.length === 0) {
					searchPick.items = [new NoResultPickItem()];
				}
				searchPick.busy = false;
			}
		});
		currentStreamer.start().catch((err) => {
			if (err.name === 'AbortError') {
				return; // Ignore abort errors
			}
			console.error(`Error streaming search results`, err);
			searchPick.busy = false;
		});
	});
	searchPick.onDidChangeSelection(async (items) => {
		if (items.length === 0) {
			return;
		}

		const item = items[0];
		if (item instanceof SearchPickItem) {
			await vscode.window.showTextDocument(item.uri, {
				preview: true,
				preserveFocus: true,
				viewColumn: vscode.ViewColumn.Active,
				selection: new vscode.Selection(item.position, item.position),
			});
		}
	});
	searchPick.onDidHide(() => {
		cancelCurrent();
		searchPick.dispose();
	});
	searchPick.onDidTriggerButton((button) => {
		if (!(button instanceof SearchPickButton)) {
			return;
		}
		if (button.action === 'stop') {
			cancelCurrent();
		}
	});
	searchPick.show();
}

export function activate(context: vscode.ExtensionContext) {
	const jadxFs = new JadxFs();
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('jadx', jadxFs, { isCaseSensitive: true, isReadonly: true }));

	const definitionProvider = new providers.JadxDefinitionProvider();
	context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'java', scheme: 'jadx' }, definitionProvider));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'xml', scheme: 'jadx' }, definitionProvider));

	const referenceProvider = new providers.JadxReferenceProvider();
	context.subscriptions.push(vscode.languages.registerReferenceProvider({ language: 'java', scheme: 'jadx' }, referenceProvider));

	const hoverProvider = new providers.JadxHoverProvider();
	context.subscriptions.push(vscode.languages.registerHoverProvider({ language: 'java', scheme: 'jadx' }, hoverProvider));
	context.subscriptions.push(vscode.languages.registerHoverProvider({ language: 'xml', scheme: 'jadx' }, hoverProvider));

	const documentSymbolProvider = new providers.JadxDocumentSymbol();
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'java', scheme: 'jadx' }, documentSymbolProvider));

	context.subscriptions.push(vscode.commands.registerCommand('jadx.openFiles', async () => {
		openUris(await selectFiles());
	}));
	context.subscriptions.push(vscode.commands.registerCommand('jadx.openFolders', async () => {
		openUris(await selectFolders());
	}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('jadx.addFiles', async (editor) => {
		addUris(editor.document.uri, await selectFiles());
	}));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('jadx.addFolders', async (editor) => {
		addUris(editor.document.uri, await selectFolders());
	}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('jadx.findAnything', async (editor) => {
		findAnything(editor.document.uri);
	}));
}

export function deactivate() { }

