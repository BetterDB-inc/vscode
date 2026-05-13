import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { SearchQueryService, parseSearchResponse, tokenizeCommand } from '../services/SearchQueryService';
import { CliTerminalBridge } from '../services/CliTerminalBridge';
import { WebviewToExtMessage } from '../webview/searchQuery/types';
import { IndexField } from '../shared/types';

const NONCE_LENGTH = 32;
const NONCE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function extractPrefix(rawFtInfo: unknown): string | undefined {
  if (!Array.isArray(rawFtInfo)) return undefined;
  const toStr = (v: unknown): string => typeof v === 'string' ? v : Buffer.isBuffer(v) ? v.toString() : String(v);
  for (let i = 0; i < rawFtInfo.length - 1; i += 2) {
    if (toStr(rawFtInfo[i]) !== 'index_definition') continue;
    const def = rawFtInfo[i + 1];
    if (!Array.isArray(def)) return undefined;
    for (let j = 0; j < def.length - 1; j += 2) {
      if (toStr(def[j]) === 'prefixes') {
        const list = def[j + 1];
        if (Array.isArray(list) && list.length > 0) return toStr(list[0]);
      }
    }
  }
  return undefined;
}

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

    const sendError = (context: string, err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      webview.postMessage({ command: 'error', context, message });
    };

    const sendCliAck = async (action: 'execute' | 'send', op: () => Promise<void>) => {
      try {
        await op();
        webview.postMessage({ command: 'cliAck', action, ok: true });
      } catch (err) {
        webview.postMessage({
          command: 'cliAck', action, ok: false,
          error: err instanceof Error ? err.message : 'Failed to send to CLI',
        });
      }
    };

    const messageHandler = webview.onDidReceiveMessage(async (msg: WebviewToExtMessage) => {
      const activeClient = this.connectionManager.getClient(connectionId);
      if (!activeClient) {
        webview.postMessage({ command: 'connectionLost' });
        return;
      }

      switch (msg.command) {
        case 'fetchIndexes':
          try {
            const indexes = await this.service.listIndexes(activeClient);
            const caps = this.connectionManager.getCapabilities(connectionId);
            const cfg = this.connectionManager.getState(connectionId)?.config;
            const connection = cfg ? { host: cfg.host, port: cfg.port } : undefined;
            webview.postMessage({
              command: 'init',
              indexes,
              selectedIndex: this.selectedIndexes.get(connectionId) ?? null,
              caps,
              connection,
            });
          } catch (err) { sendError('fetchIndexes', err); }
          return;
        case 'fetchSchema':
          try {
            const fields = await this.service.fetchIndexSchema(activeClient, msg.index);
            webview.postMessage({ command: 'indexSchema', index: msg.index, fields });
            this.selectedIndexes.set(connectionId, msg.index);
          } catch (err) { sendError(`fetchSchema:${msg.index}`, err); }
          return;
        case 'fetchTagValues':
          try {
            const values = await this.service.fetchTagValues(activeClient, msg.index, msg.field);
            webview.postMessage({ command: 'tagValues', field: msg.field, values });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (/unknown command/i.test(message)) {
              webview.postMessage({ command: 'tagValues', field: msg.field, values: [] });
            } else {
              sendError(`fetchTagValues:${msg.field}`, err);
            }
          }
          return;
        case 'executeInCli':
          await sendCliAck('execute', () => this.bridge.sendAndExecute(connectionId, msg.commandLine));
          return;
        case 'sendToCli':
          await sendCliAck('send', () => this.bridge.sendForEdit(connectionId, msg.commandLine));
          return;
        case 'executeQuery': {
          const started = Date.now();
          try {
            const tokens = tokenizeCommand(msg.commandLine);
            if (tokens.length === 0) {
              throw new Error('Empty command');
            }
            const [cmd, ...args] = tokens;
            const callArgs: (string | Buffer)[] = [...args];
            const isVectorQuery = Boolean(msg.vectorBytes);
            if (isVectorQuery) {
              const buf = Buffer.from(msg.vectorBytes!, 'base64');
              callArgs.push('DIALECT', '2', 'PARAMS', '2', 'vec', buf);
            }
            const raw = await activeClient.call(cmd, ...callArgs);
            const parsed = parseSearchResponse(raw);
            webview.postMessage({
              command: 'queryResult', ok: true,
              total: parsed.total, hits: parsed.hits,
              tookMs: Date.now() - started,
              commandLine: msg.commandLine,
              isVectorQuery,
              scoreField: msg.scoreField,
              distanceMetric: msg.distanceMetric,
            });
          } catch (err) {
            webview.postMessage({
              command: 'queryResult', ok: false,
              error: err instanceof Error ? err.message : String(err),
              commandLine: msg.commandLine,
            });
          }
          return;
        }
        case 'pickVectorKey': {
          try {
            const schema = await this.service.fetchIndexSchema(activeClient, msg.index);
            const vectorField = schema.find((f) => f.type === 'VECTOR');
            if (!vectorField || !vectorField.vectorDim) {
              vscode.window.showErrorMessage(`Index ${msg.index} has no vector field`);
              return;
            }
            const info = await activeClient.call('FT.INFO', msg.index);
            const prefix = extractPrefix(info);
            if (!prefix) {
              vscode.window.showErrorMessage(`Cannot determine key prefix for ${msg.index}`);
              return;
            }
            const picked = await this.pickKeyWithVector(activeClient, prefix, vectorField);
            if (picked) {
              webview.postMessage({
                command: 'vectorKeyPicked',
                key: picked.key,
                bytes: picked.bytes.toString('base64'),
                byteLength: picked.bytes.byteLength,
              });
            }
          } catch (err) { sendError(`pickVectorKey:${msg.index}`, err); }
          return;
        }
        case 'openKey':
          vscode.commands.executeCommand('betterdb.openKey', connectionId, msg.key);
          return;
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

  notifyConnectionRemoved(connectionId: string): void {
    const panel = this.panels.get(connectionId);
    if (panel) {
      panel.dispose();
    } else {
      this.selectedIndexes.delete(connectionId);
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

  private async pickKeyWithVector(
    client: { call: (cmd: string, ...args: (string | number | Buffer)[]) => Promise<unknown> },
    prefix: string,
    vectorField: IndexField,
  ): Promise<{ key: string; bytes: Buffer } | undefined> {
    const items = await this.scanKeys(client, `${prefix}*`, 500);
    if (items.length === 0) {
      vscode.window.showWarningMessage(`No keys match ${prefix}*`);
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(items, {
      matchOnDescription: true,
      title: `Pick a key with vector field @${vectorField.name}`,
    });
    if (!picked) return undefined;
    const bytes = await this.service.fetchVectorBytes(client, picked.label, vectorField.name);
    const expected = (vectorField.vectorDim ?? 0) * 4;
    if (bytes.byteLength !== expected) {
      vscode.window.showErrorMessage(
        `Key ${picked.label} has ${bytes.byteLength} bytes; index expects ${expected}.`
      );
      return undefined;
    }
    return { key: picked.label, bytes };
  }

  private async scanKeys(
    client: { call: (cmd: string, ...args: (string | number | Buffer)[]) => Promise<unknown> },
    match: string,
    cap: number,
  ): Promise<vscode.QuickPickItem[]> {
    const out: vscode.QuickPickItem[] = [];
    let cursor = '0';
    do {
      const res = await client.call('SCAN', cursor, 'MATCH', match, 'COUNT', '100') as [string, string[]];
      cursor = res[0];
      for (const k of res[1]) {
        out.push({ label: k });
        if (out.length >= cap) return out;
      }
    } while (cursor !== '0');
    return out;
  }

  dispose(): void {
    for (const panel of [...this.panels.values()]) {
      panel.dispose();
    }
  }
}
