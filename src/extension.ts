// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const IDLE_THRESHOLD_MS = 1 * 60 * 1000;
const TICK_INTERVAL_MS = 1000;
const HISTORY_KEY = 'timetrack.history';
const LANGUAGE_HISTORY_KEY = 'timetrack.languageHistory';
const FRAMEWORK_HISTORY_KEY = 'timetrack.frameworkHistory';
const LEGACY_PROJECT_KEY = 'Legacy';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let lastActivityAt = Date.now();
	let lastTickAt = Date.now();
	let lastPersistAt = Date.now();
	let history = normalizeHistory(
		context.globalState.get<StoredHistory>(HISTORY_KEY)
	);
	let languageHistory = normalizeNestedHistory(
		context.globalState.get<NestedHistory>(LANGUAGE_HISTORY_KEY)
	);
	let frameworkHistory = normalizeNestedHistory(
		context.globalState.get<NestedHistory>(FRAMEWORK_HISTORY_KEY)
	);
	let todayKey = getDateKey(new Date());
	let currentProject = getCurrentProject(
		vscode.window.activeTextEditor,
		vscode.workspace.workspaceFolders
	);
	let todayMs = getProjectDayMs(history, currentProject?.id, todayKey);
	let currentLanguage =
		vscode.window.activeTextEditor?.document.languageId ?? 'unknown';
	const projectFrameworks = new Map<string, string[]>();
	updateFrameworkCache(projectFrameworks, vscode.workspace.workspaceFolders);
	let statsPanel: vscode.WebviewPanel | undefined;

	const getStatsData = (): StatsData => ({
		rows: buildHistoryRows(history, todayKey, todayMs, currentProject?.id),
		languageHistory,
		frameworkHistory
	});

	const statusItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusItem.text = buildStatusText(todayMs, true);
	statusItem.tooltip = 'Active coding time today !';
	statusItem.command = 'timetrack.openStats';
	statusItem.show();

	const markActivity = () => {
		lastActivityAt = Date.now();
	};

	const activityDisposables: vscode.Disposable[] = [
		vscode.workspace.onDidChangeTextDocument((event) => {
			currentLanguage = event.document.languageId ?? currentLanguage;
			currentProject = getCurrentProject(
				vscode.window.activeTextEditor,
				vscode.workspace.workspaceFolders,
				event.document.uri
			);
			todayMs = getProjectDayMs(history, currentProject?.id, todayKey);
			markActivity();
		}),
		vscode.window.onDidChangeTextEditorSelection(() => markActivity()),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			currentProject = getCurrentProject(
				editor,
				vscode.workspace.workspaceFolders
			);
			todayMs = getProjectDayMs(history, currentProject?.id, todayKey);
			currentLanguage = editor?.document.languageId ?? currentLanguage;
			markActivity();
		}),
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused) {
				markActivity();
			}
		}),
		vscode.window.onDidOpenTerminal(() => markActivity()),
		vscode.window.onDidChangeActiveTerminal(() => markActivity())
	];
	activityDisposables.push(
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			currentProject = getCurrentProject(
				vscode.window.activeTextEditor,
				vscode.workspace.workspaceFolders
			);
			todayMs = getProjectDayMs(history, currentProject?.id, todayKey);
			updateFrameworkCache(
				projectFrameworks,
				vscode.workspace.workspaceFolders
			);
		})
	);

	const timer = setInterval(() => {
		const now = Date.now();
		const currentKey = getDateKey(new Date(now));
		if (currentKey !== todayKey) {
			if (currentProject?.id) {
				setProjectDayMs(history, currentProject.id, todayKey, todayMs);
			}
			todayKey = currentKey;
			todayMs = getProjectDayMs(history, currentProject?.id, todayKey);
		}

		const isWorkspaceOpen = !!vscode.workspace.workspaceFolders?.length;
		const isActive =
			isWorkspaceOpen && now - lastActivityAt <= IDLE_THRESHOLD_MS;
		const delta = now - lastTickAt;
		if (isActive) {
			todayMs += delta;
			if (currentProject?.id) {
				const languageKey = normalizeLanguageLabel(currentLanguage || 'unknown');
				addNestedMs(
					languageHistory,
					currentProject.id,
					todayKey,
					languageKey,
					delta
				);
				const frameworks =
					projectFrameworks.get(currentProject.id) ?? ['Unknown'];
				const slice = delta / frameworks.length;
				for (const framework of frameworks) {
					addNestedMs(
						frameworkHistory,
						currentProject.id,
						todayKey,
						framework,
						slice
					);
				}
			}
		}
		lastTickAt = now;

		if (now - lastPersistAt >= 15000) {
			if (currentProject?.id) {
				setProjectDayMs(history, currentProject.id, todayKey, todayMs);
			}
			void context.globalState.update(HISTORY_KEY, history);
			void context.globalState.update(LANGUAGE_HISTORY_KEY, languageHistory);
			void context.globalState.update(FRAMEWORK_HISTORY_KEY, frameworkHistory);
			lastPersistAt = now;
		}

		statusItem.text = buildStatusText(todayMs, isActive);
	}, TICK_INTERVAL_MS);

	const openStats = vscode.commands.registerCommand(
		'timetrack.openStats',
		async () => {
			if (statsPanel) {
				statsPanel.reveal(vscode.ViewColumn.One);
				void statsPanel.webview.postMessage({
					type: 'statsData',
					payload: getStatsData()
				});
				return;
			}
			const panel = vscode.window.createWebviewPanel(
				'timetrackStats',
				'TimeTrack Stats',
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					localResourceRoots: [
						vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview')
					]
				}
			);
			statsPanel = panel;
			panel.onDidDispose(() => {
				statsPanel = undefined;
			});
			panel.webview.onDidReceiveMessage((message) => {
				if (message?.type === 'deleteHistory') {
					const payload = message.payload as
						| { project?: string; date?: string }
						| undefined;
					const projectId = payload?.project;
					const dateKey = payload?.date;
					if (typeof projectId === 'string' && typeof dateKey === 'string') {
						removeHistoryEntry(history, projectId, dateKey);
						removeNestedHistoryEntry(languageHistory, projectId, dateKey);
						removeNestedHistoryEntry(frameworkHistory, projectId, dateKey);
						if (currentProject?.id === projectId && dateKey === todayKey) {
							todayMs = 0;
						}
						void context.globalState.update(HISTORY_KEY, history);
						void context.globalState.update(
							LANGUAGE_HISTORY_KEY,
							languageHistory
						);
						void context.globalState.update(
							FRAMEWORK_HISTORY_KEY,
							frameworkHistory
						);
						void panel.webview.postMessage({
							type: 'statsData',
							payload: getStatsData()
						});
					}
				}
			});

			panel.webview.html = getWebviewHtml(
				context,
				panel.webview,
				getStatsData()
			);
		}
	);

	const resetData = vscode.commands.registerCommand(
		'timetrack.resetData',
		async () => {
			const confirmation = await vscode.window.showWarningMessage(
				'Reset all TimeTrack history data? This cannot be undone.',
				{ modal: true },
				'Reset'
			);
			if (confirmation !== 'Reset') {
				return;
			}
			history = {};
			languageHistory = {};
			frameworkHistory = {};
			todayMs = 0;
			void context.globalState.update(HISTORY_KEY, history);
			void context.globalState.update(LANGUAGE_HISTORY_KEY, languageHistory);
			void context.globalState.update(FRAMEWORK_HISTORY_KEY, frameworkHistory);
			statusItem.text = buildStatusText(todayMs, true);
			if (statsPanel) {
				void statsPanel.webview.postMessage({
					type: 'statsData',
					payload: getStatsData()
				});
			}
			void vscode.window.showInformationMessage('TimeTrack data cleared.');
		}
	);

	context.subscriptions.push(
		statusItem,
		openStats,
		resetData,
		...activityDisposables
	);
	context.subscriptions.push({
		dispose: () => clearInterval(timer)
	});
	context.subscriptions.push({
		dispose: () => {
			if (currentProject?.id) {
				setProjectDayMs(history, currentProject.id, todayKey, todayMs);
			}
			void context.globalState.update(HISTORY_KEY, history);
			void context.globalState.update(LANGUAGE_HISTORY_KEY, languageHistory);
			void context.globalState.update(FRAMEWORK_HISTORY_KEY, frameworkHistory);
		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() {}

function getDateKey(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function formatDuration(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	return `${hours.toString().padStart(2, '0')}h ${minutes
		.toString()
		.padStart(2, '0')}m`;
}

function buildStatusText(ms: number, isActive: boolean): string {
	const icon = isActive ? '$(circle-small-filled)' : '$(circle-small)';
	return `$(clock) ${formatDuration(ms)}${icon}`;
}

type StatsData = {
	rows: Array<{ project: string; date: string; ms: number }>;
	languageHistory: NestedHistory;
	frameworkHistory: NestedHistory;
};

function getWebviewHtml(
	context: vscode.ExtensionContext,
	webview: vscode.Webview,
	data: StatsData
): string {
	const distPath = vscode.Uri.joinPath(
		context.extensionUri,
		'dist',
		'webview'
	);
	const indexPath = vscode.Uri.joinPath(distPath, 'index.html');
	let html = fs.readFileSync(indexPath.fsPath, 'utf8');

	const baseUri = webview.asWebviewUri(distPath).toString();
	html = html.replace(
		/(src|href)="\.?\/?assets\//g,
		`$1="${baseUri}/assets/`
	);

	const nonce = getNonce();
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} data:`,
		`font-src ${webview.cspSource}`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}' ${webview.cspSource}`
	].join('; ');
	const cspTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
	html = html.replace('<head>', `<head>\n\t${cspTag}`);

	const dataScript = `<script nonce="${nonce}">window.__TIMETRACK_DATA__=${JSON.stringify(
		data
	)};</script>`;
	html = html.replace('</head>', `\t${dataScript}\n</head>`);

	return html;
}

type LegacyHistory = Record<string, number>;
type NormalizedHistory = Record<string, Record<string, number>>;
type StoredHistory = LegacyHistory | NormalizedHistory | undefined;
type NestedHistory = Record<string, Record<string, Record<string, number>>>;

function normalizeHistory(history: StoredHistory): NormalizedHistory {
	if (!history) {
		return {};
	}
	const values = Object.values(history);
	if (values.length && typeof values[0] === 'object') {
		return history as NormalizedHistory;
	}
	return { [LEGACY_PROJECT_KEY]: history as LegacyHistory };
}

function normalizeNestedHistory(
	history: NestedHistory | undefined
): NestedHistory {
	return history ?? {};
}

function getCurrentProject(
	editor: vscode.TextEditor | undefined,
	folders: readonly vscode.WorkspaceFolder[] | undefined,
	documentUri?: vscode.Uri
): { id: string; name: string } | undefined {
	if (!folders?.length) {
		return undefined;
	}
	const targetUri = documentUri ?? editor?.document.uri;
	if (targetUri) {
		const folder = vscode.workspace.getWorkspaceFolder(targetUri);
		if (folder) {
			return { id: folder.name, name: folder.name };
		}
	}
	const fallback = folders[0];
	return { id: fallback.name, name: fallback.name };
}

function getProjectDayMs(
	history: NormalizedHistory,
	projectId: string | undefined,
	dateKey: string
): number {
	if (!projectId) {
		return 0;
	}
	return history[projectId]?.[dateKey] ?? 0;
}

function setProjectDayMs(
	history: NormalizedHistory,
	projectId: string,
	dateKey: string,
	value: number
): void {
	if (!history[projectId]) {
		history[projectId] = {};
	}
	history[projectId][dateKey] = value;
}

function addNestedMs(
	history: NestedHistory,
	projectId: string,
	dateKey: string,
	category: string,
	value: number
): void {
	if (!history[projectId]) {
		history[projectId] = {};
	}
	if (!history[projectId][dateKey]) {
		history[projectId][dateKey] = {};
	}
	history[projectId][dateKey][category] =
		(history[projectId][dateKey][category] ?? 0) + value;
}

function buildHistoryRows(
	history: NormalizedHistory,
	todayKey: string,
	todayMs: number,
	currentProjectId?: string
): Array<{ project: string; date: string; ms: number }> {
	const rowsByKey = new Map<string, { project: string; date: string; ms: number }>();
	for (const [projectId, days] of Object.entries(history)) {
		for (const [dateKey, ms] of Object.entries(days)) {
			rowsByKey.set(`${projectId}|${dateKey}`, {
				project: projectId,
				date: dateKey,
				ms
			});
		}
	}
	if (currentProjectId) {
		rowsByKey.set(`${currentProjectId}|${todayKey}`, {
			project: currentProjectId,
			date: todayKey,
			ms: todayMs
		});
	} else if (rowsByKey.size === 0 && todayMs > 0) {
		rowsByKey.set(`${LEGACY_PROJECT_KEY}|${todayKey}`, {
			project: LEGACY_PROJECT_KEY,
			date: todayKey,
			ms: todayMs
		});
	}
	const rows = Array.from(rowsByKey.values());
	return rows.sort((a, b) => {
		if (a.project === b.project) {
			return a.date < b.date ? 1 : -1;
		}
		return a.project < b.project ? 1 : -1;
	});
}

function removeHistoryEntry(
	history: NormalizedHistory,
	projectId: string,
	dateKey: string
): void {
	const project = history[projectId];
	if (!project || project[dateKey] === undefined) {
		return;
	}
	delete project[dateKey];
	if (!Object.keys(project).length) {
		delete history[projectId];
	}
}

function removeNestedHistoryEntry(
	history: NestedHistory,
	projectId: string,
	dateKey: string
): void {
	const project = history[projectId];
	if (!project || !project[dateKey]) {
		return;
	}
	delete project[dateKey];
	if (!Object.keys(project).length) {
		delete history[projectId];
	}
}

function getNonce(): string {
	let value = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 16; i += 1) {
		value += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return value;
}

function updateFrameworkCache(
	cache: Map<string, string[]>,
	folders: readonly vscode.WorkspaceFolder[] | undefined
): void {
	cache.clear();
	if (!folders?.length) {
		return;
	}
	for (const folder of folders) {
		cache.set(folder.name, detectFrameworks(folder.uri.fsPath));
	}
}

function detectFrameworks(rootPath: string): string[] {
	const frameworks = new Set<string>();
	const packageJsonPath = path.join(rootPath, 'package.json');
	if (fs.existsSync(packageJsonPath)) {
		try {
			const content = fs.readFileSync(packageJsonPath, 'utf8');
			const pkg = JSON.parse(content) as {
				dependencies?: Record<string, string>;
				devDependencies?: Record<string, string>;
			};
			const deps = {
				...pkg.dependencies,
				...pkg.devDependencies
			};
			if (
				deps.next ||
				fs.existsSync(path.join(rootPath, 'next.config.js')) ||
				fs.existsSync(path.join(rootPath, 'next.config.ts'))
			) {
				frameworks.add('Next.js');
			}
			if (
				deps.nuxt ||
				fs.existsSync(path.join(rootPath, 'nuxt.config.ts')) ||
				fs.existsSync(path.join(rootPath, 'nuxt.config.js'))
			) {
				frameworks.add('Nuxt');
			}
			if (
				deps['@angular/core'] ||
				fs.existsSync(path.join(rootPath, 'angular.json'))
			) {
				frameworks.add('Angular');
			}
			if (deps.vue || fs.existsSync(path.join(rootPath, 'vue.config.js'))) {
				frameworks.add('Vue');
			}
			if (deps.react && !frameworks.has('Next.js')) {
				frameworks.add('React');
			}
			if (
				deps['@sveltejs/kit'] ||
				fs.existsSync(path.join(rootPath, 'svelte.config.js'))
			) {
				frameworks.add('Svelte');
			}
			if (
				deps.astro ||
				fs.existsSync(path.join(rootPath, 'astro.config.mjs'))
			) {
				frameworks.add('Astro');
			}
			if (
				deps.remix ||
				fs.existsSync(path.join(rootPath, 'remix.config.js'))
			) {
				frameworks.add('Remix');
			}
			if (deps['@nestjs/core']) {
				frameworks.add('NestJS');
			}
			if (deps.express) {
				frameworks.add('Express');
			}
			if (deps.fastify) {
				frameworks.add('Fastify');
			}
			if (deps.koa) {
				frameworks.add('Koa');
			}
			if (deps.vite) {
				frameworks.add('Vite');
			}
		} catch {
			frameworks.add('Unknown');
		}
	}
	if (
		fs.existsSync(path.join(rootPath, 'django')) ||
		fs.existsSync(path.join(rootPath, 'manage.py'))
	) {
		frameworks.add('Django');
	}
	if (
		fs.existsSync(path.join(rootPath, 'rails')) ||
		fs.existsSync(path.join(rootPath, 'config', 'application.rb'))
	) {
		frameworks.add('Rails');
	}
	if (!frameworks.size) {
		frameworks.add('Unknown');
	}
	return Array.from(frameworks);
}

function normalizeLanguageLabel(languageId: string): string {
	const id = languageId.toLowerCase();
	switch (id) {
		case 'typescript':
		case 'typescriptreact':
			return 'TypeScript';
		case 'javascript':
		case 'javascriptreact':
			return 'JavaScript';
		case 'python':
			return 'Python';
		case 'go':
			return 'Go';
		case 'rust':
			return 'Rust';
		case 'c':
			return 'C';
		case 'cpp':
			return 'C++';
		case 'csharp':
			return 'C#';
		case 'java':
			return 'Java';
		case 'php':
			return 'PHP';
		case 'ruby':
			return 'Ruby';
		case 'swift':
			return 'Swift';
		case 'kotlin':
			return 'Kotlin';
		case 'dart':
			return 'Dart';
		case 'shellscript':
		case 'shell':
		case 'bash':
		case 'zsh':
			return 'Shell';
		case 'json':
			return 'JSON';
		case 'yaml':
		case 'yml':
			return 'YAML';
		case 'html':
			return 'HTML';
		case 'css':
			return 'CSS';
		case 'scss':
			return 'SCSS';
		case 'less':
			return 'LESS';
		case 'markdown':
		case 'md':
			return 'Markdown';
		case 'sql':
			return 'SQL';
		case 'dockerfile':
			return 'Dockerfile';
		default:
			if (!languageId) {
				return 'Unknown';
			}
			return languageId.replace(/\b\w/g, (m) => m.toUpperCase());
	}
}
