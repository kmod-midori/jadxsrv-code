import * as vscode from 'vscode';
import { JadxFs } from './jadxFsProvider';
import * as api from './api';
import * as providers from './providers';
import { extractFromUri, JadxLocation, jadxLocationToUri, JSONStreamer } from './utils';
import { nanoid } from 'nanoid';

function openDecompiler() {
	vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse('jadx:/'), false);
	vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
	vscode.commands.executeCommand('workbench.view.explorer');
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

	constructor(item: WorkspaceSymbol) {
		this.label = item.name;
		this.description = item.containerName;
		this.iconPath = new vscode.ThemeIcon(symbolKindToIcon(item.kind));
		this.detail = item.detail;
		this.uri = jadxLocationToUri(item.location);
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

async function findAnything() {
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
	const baseUrl = 'http://127.0.0.1:28080/search';

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
				const searchItem = new SearchPickItem(item);
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

async function renameSymbol(editor: vscode.TextEditor, jadxFs: JadxFs): Promise<void> {
	const document = editor.document;
	const position = editor.selection.active;
	const wordRange = document.getWordRangeAtPosition(position);
	const offset = document.offsetAt(wordRange?.start ?? position);
	const { path } = extractFromUri(document.uri);
	const renameInfo = await api.fetchRenameInfo(path, offset);
	if (!renameInfo.canRename || renameInfo.name === null) {
		void vscode.window.showInformationMessage('The symbol at the current position cannot be renamed.');
		return;
	}
	const name = await vscode.window.showInputBox({
		title: 'Rename JADX Symbol',
		prompt: 'Enter a Java identifier, or leave empty to reset the alias.',
		value: renameInfo.name,
		valueSelection: [0, renameInfo.name.length],
	});
	if (name === undefined) {
		return;
	}

	try {
		const response = await api.renameSymbol(path, offset, name);
		const renamedUri = jadxLocationToUri(response.location);
		jadxFs.notifyRenamed(document.uri, renamedUri);
		if (renamedUri.toString() !== document.uri.toString()) {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		} else {
			await vscode.commands.executeCommand('workbench.action.files.revert');
		}
		await vscode.window.showTextDocument(renamedUri, {
			preview: false,
			viewColumn: editor.viewColumn,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(message);
	}
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

	context.subscriptions.push(vscode.commands.registerCommand('jadx.openDecompiler', () => {
		openDecompiler();
	}));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand('jadx.findAnything', async () => {
		findAnything();
	}));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand('jadx.renameSymbol', async (editor) => {
		await renameSymbol(editor, jadxFs);
	}));
}

export function deactivate() { }

