import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { SearchQueryService } from '../services/SearchQueryService';
import { CliTerminalBridge } from '../services/CliTerminalBridge';
import { WebviewToExtMessage } from '../webview/searchQuery/types';

const NONCE_LENGTH = 32;
const NONCE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class SearchQueryProvider implements vscode.Disposable {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private disposables: Map<string, vscode.Disposable[]> = new Map();
  private selectedIndexes: Map<string, string | null> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: ConnectionManager,
    private service: SearchQueryService,
    private bridge: CliTerminalBridge
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

    const selectedIndex = indexName ?? null;
    this.selectedIndexes.set(connectionId, selectedIndex);

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

    panel.webview.html = this.getWebviewContent(panel.webview);

    const webview = panel.webview;

    const messageHandler = webview.onDidReceiveMessage(async (msg: WebviewToExtMessage) => {
      const activeClient = this.connectionManager.getClient(connectionId);
      if (!activeClient) {
        webview.postMessage({ command: 'connectionLost' });
        return;
      }

      try {
        switch (msg.command) {
          case 'fetchIndexes': {
            const indexes = await this.service.listIndexes(activeClient);
            webview.postMessage({ command: 'init', indexes, selectedIndex: this.selectedIndexes.get(connectionId) ?? null });
            return;
          }
          case 'fetchSchema': {
            const fields = await this.service.fetchIndexSchema(activeClient, msg.index);
            webview.postMessage({ command: 'indexSchema', index: msg.index, fields });
            return;
          }
          case 'fetchTagValues': {
            const values = await this.service.fetchTagValues(activeClient, msg.index, msg.field);
            webview.postMessage({ command: 'tagValues', field: msg.field, values });
            return;
          }
          case 'executeInCli': {
            try {
              await this.bridge.sendAndExecute(connectionId, msg.commandLine);
              webview.postMessage({ command: 'cliAck', action: 'execute', ok: true });
            } catch (err) {
              webview.postMessage({
                command: 'cliAck', action: 'execute', ok: false,
                error: err instanceof Error ? err.message : 'Failed to send to CLI',
              });
            }
            return;
          }
          case 'sendToCli': {
            try {
              await this.bridge.sendForEdit(connectionId, msg.commandLine);
              webview.postMessage({ command: 'cliAck', action: 'send', ok: true });
            } catch (err) {
              webview.postMessage({
                command: 'cliAck', action: 'send', ok: false,
                error: err instanceof Error ? err.message : 'Failed to send to CLI',
              });
            }
            return;
          }
        }
      } catch (err) {
        console.error('SearchQueryProvider message error', err);
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

  private getWebviewContent(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'searchQuery.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'searchQuery.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Search Query</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
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

  private cleanupPanel(connectionId: string): void {
    const disposables = this.disposables.get(connectionId);
    if (disposables) {
      disposables.forEach((d) => d.dispose());
      this.disposables.delete(connectionId);
    }
    this.panels.delete(connectionId);
    this.selectedIndexes.delete(connectionId);
  }

  dispose(): void {
    for (const [connectionId, panel] of [...this.panels]) {
      panel.dispose();
      this.cleanupPanel(connectionId);
    }
  }
}
