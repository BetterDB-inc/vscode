import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { executeSearchQuery, deduplicateHistory } from '../services/SearchQueryService';
import { FtIndexInfo } from '../shared/types';
import { COMMANDS } from '../utils/constants';

const NONCE_LENGTH = 32;
const NONCE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class SearchQueryProvider implements vscode.Disposable {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private disposables: Map<string, vscode.Disposable[]> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: ConnectionManager
  ) {}

  async openOrReveal(connectionId: string, indexName?: string): Promise<void> {
    const state = this.connectionManager.getState(connectionId);
    const config = state?.config;
    const panelTitle = `Search: ${config?.name ?? connectionId}`;

    const existingPanel = this.panels.get(connectionId);
    if (existingPanel) {
      existingPanel.reveal();
      if (indexName) {
        existingPanel.webview.postMessage({ command: 'selectIndex', indexName });
      }
      return;
    }

    const client = this.connectionManager.getClient(connectionId);
    if (!client) {
      vscode.window.showErrorMessage('Not connected');
      return;
    }

    const keyService = new KeyService(client);
    const indexNames = await keyService.getSearchIndexList();
    const indexes: FtIndexInfo[] = await Promise.all(
      indexNames.map((name) => keyService.getSearchIndexInfo(name))
    );

    const history = this.context.globalState.get<string[]>(
      `betterdb.queryHistory.${connectionId}`
    ) ?? [];

    const panel = vscode.window.createWebviewPanel(
      'betterdb.searchQuery',
      panelTitle,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
        ]
      }
    );

    this.panels.set(connectionId, panel);

    const panelDisposables: vscode.Disposable[] = [];

    panel.webview.html = this.getWebviewContent(panel.webview, indexes, indexName ?? null, history);

    const messageHandler = panel.webview.onDidReceiveMessage(async (msg: { command: string; index?: string; query?: string; key?: string }) => {
      switch (msg.command) {
        case 'executeQuery': {
          try {
            const result = await executeSearchQuery(client, {
              command: msg.command,
              index: msg.index ?? '',
              query: msg.query ?? ''
            });
            panel.webview.postMessage({ command: 'queryResult', ...result });
          } catch (err) {
            panel.webview.postMessage({
              command: 'queryResult',
              results: [],
              total: 0,
              tookMs: 0,
              error: err instanceof Error ? err.message : String(err)
            });
          }
          break;
        }

        case 'openKey': {
          if (msg.key) {
            vscode.commands.executeCommand(COMMANDS.OPEN_KEY, connectionId, msg.key);
          }
          break;
        }

        case 'saveHistory': {
          if (msg.query !== undefined) {
            const existing = this.context.globalState.get<string[]>(
              `betterdb.queryHistory.${connectionId}`
            ) ?? [];
            const updated = deduplicateHistory(existing, msg.query, 100);
            await this.context.globalState.update(
              `betterdb.queryHistory.${connectionId}`,
              updated
            );
          }
          break;
        }
      }
    });
    panelDisposables.push(messageHandler);

    panel.onDidDispose(() => {
      this.cleanupPanel(connectionId);
    }, null, panelDisposables);

    this.disposables.set(connectionId, panelDisposables);
  }

  notifyConnectionLost(connectionId: string): void {
    const panel = this.panels.get(connectionId);
    if (panel) {
      panel.webview.postMessage({ command: 'connectionLost' });
    }
  }

  private getWebviewContent(
    webview: vscode.Webview,
    indexes: FtIndexInfo[],
    selectedIndex: string | null,
    history: string[]
  ): string {
    const nonce = this.getNonce();

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'searchQuery.js')
    );

    const initialData = this.escapeJsonForHtml(
      JSON.stringify({ indexes, selectedIndex, history })
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Search Query</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.initialData = ${initialData};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    for (let i = 0; i < NONCE_LENGTH; i++) {
      text += NONCE_CHARACTERS.charAt(Math.floor(Math.random() * NONCE_CHARACTERS.length));
    }
    return text;
  }

  private escapeJsonForHtml(json: string): string {
    return json
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  private cleanupPanel(connectionId: string): void {
    const disposables = this.disposables.get(connectionId);
    if (disposables) {
      disposables.forEach((d) => d.dispose());
      this.disposables.delete(connectionId);
    }
    this.panels.delete(connectionId);
  }

  dispose(): void {
    for (const [connectionId, panel] of this.panels) {
      panel.dispose();
      this.cleanupPanel(connectionId);
    }
    this.panels.clear();
    this.disposables.clear();
  }
}
