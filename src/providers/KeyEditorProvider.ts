import * as vscode from 'vscode';
import { KeyService } from '../services/KeyService';
import { KeyValue } from '../models/key.model';
import { showError } from '../utils/errors';

interface WebviewMessage {
  command: string;
  type?: string;
  value?: unknown;
  ttl?: number;
}

const NONCE_LENGTH = 32;
const NONCE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export class KeyEditorProvider implements vscode.Disposable {
  private panels: Map<string, vscode.WebviewPanel> = new Map();
  private disposables: Map<string, vscode.Disposable[]> = new Map();

  constructor(
    private context: vscode.ExtensionContext,
    private onKeyDeleted: () => void
  ) {}

  async openKeyEditor(
    keyService: KeyService,
    connectionId: string,
    key: string
  ): Promise<void> {
    const panelKey = `${connectionId}:${key}`;

    const existingPanel = this.panels.get(panelKey);
    if (existingPanel) {
      existingPanel.reveal();
      return;
    }

    const keyValue = await keyService.getValue(key);
    if (!keyValue) {
      vscode.window.showErrorMessage(`Key "${key}" not found`);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'betterdb.keyEditor',
      `Key: ${key}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')
        ]
      }
    );

    this.panels.set(panelKey, panel);

    const panelDisposables: vscode.Disposable[] = [];

    const messageHandler = panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        await this.handleMessage(keyService, key, message, panel);
      }
    );
    panelDisposables.push(messageHandler);

    panel.onDidDispose(() => {
      this.cleanupPanel(panelKey);
    }, null, panelDisposables);

    this.disposables.set(panelKey, panelDisposables);

    panel.webview.html = this.getWebviewContent(panel.webview, keyValue);
  }

  private async handleMessage(
    keyService: KeyService,
    key: string,
    message: WebviewMessage,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    try {
      switch (message.command) {
        case 'save': {
          await this.handleSave(keyService, key, message);
          const updatedValue = await keyService.getValue(key);
          if (updatedValue) {
            panel.webview.postMessage({ command: 'update', data: this.toWebviewData(updatedValue) });
          }
          vscode.window.showInformationMessage(`Key "${key}" saved successfully`);
          break;
        }

        case 'delete': {
          const confirmed = await vscode.window.showWarningMessage(
            `Delete key "${key}"?`,
            { modal: true },
            'Delete'
          );
          if (confirmed === 'Delete') {
            await keyService.deleteKey(key);
            panel.dispose();
            this.onKeyDeleted();
            vscode.window.showInformationMessage(`Key "${key}" deleted`);
          }
          break;
        }

        case 'setTtl':
          if (message.ttl !== undefined) {
            await keyService.setTTL(key, message.ttl);
            const refreshed = await keyService.getValue(key);
            if (refreshed) {
              panel.webview.postMessage({ command: 'update', data: this.toWebviewData(refreshed) });
            }
            vscode.window.showInformationMessage(
              message.ttl > 0 ? `TTL set to ${message.ttl} seconds` : 'TTL removed'
            );
          }
          break;

        case 'refresh': {
          const newValue = await keyService.getValue(key);
          if (newValue) {
            panel.webview.postMessage({ command: 'update', data: this.toWebviewData(newValue) });
          } else {
            vscode.window.showWarningMessage('Key no longer exists');
            panel.dispose();
            this.onKeyDeleted();
          }
          break;
        }

        case 'editTtl': {
          const ttlInput = await vscode.window.showInputBox({
            prompt: 'Enter TTL in seconds (0 or empty to remove expiry)',
            value: ''
          });
          if (ttlInput !== undefined) {
            const ttl = parseInt(ttlInput, 10) || 0;
            await keyService.setTTL(key, ttl);
            const refreshed = await keyService.getValue(key);
            if (refreshed) {
              panel.webview.postMessage({ command: 'update', data: this.toWebviewData(refreshed) });
            }
            vscode.window.showInformationMessage(
              ttl > 0 ? `TTL set to ${ttl} seconds` : 'TTL removed'
            );
          }
          break;
        }
      }
    } catch (error) {
      showError(error, 'Operation failed');
    }
  }

  private async handleSave(
    keyService: KeyService,
    key: string,
    message: WebviewMessage
  ): Promise<void> {
    switch (message.type) {
      case 'string':
        await keyService.setString(key, message.value as string);
        break;

      case 'hash': {
        const hashFields = message.value as Array<{ field: string; value: string }>;
        const hashObj: Record<string, string> = {};
        for (const { field, value } of hashFields) {
          if (field.trim()) {
            hashObj[field] = value;
          }
        }
        await keyService.setHash(key, hashObj);
        break;
      }

      case 'list': {
        const listElements = message.value as string[];
        await keyService.setList(key, listElements);
        break;
      }

      case 'set': {
        const setMembers = message.value as string[];
        await keyService.setSet(key, setMembers);
        break;
      }

      case 'zset': {
        const zsetMembers = message.value as Array<{ member: string; score: number }>;
        await keyService.setZset(
          key,
          zsetMembers.map((m) => ({ score: m.score, member: m.member }))
        );
        break;
      }

      case 'json':
        await keyService.setJson(key, message.value as string);
        break;
    }
  }

  private toWebviewData(keyValue: KeyValue) {
    return {
      key: keyValue.key,
      type: keyValue.value.type,
      ttl: keyValue.ttl,
      value: keyValue.value
    };
  }

  private getWebviewContent(webview: vscode.Webview, keyValue: KeyValue): string {
    const nonce = this.getNonce();

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'keyEditor.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'keyEditor.css')
    );

    const initialData = this.escapeJsonForHtml(JSON.stringify(this.toWebviewData(keyValue)));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Key Editor</title>
  <link rel="stylesheet" href="${styleUri}">
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

  /**
   * Escapes a JSON string for safe embedding in HTML <script> tags.
   * Prevents XSS by escaping characters that could break out of the script context.
   */
  private escapeJsonForHtml(json: string): string {
    return json
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  private cleanupPanel(panelKey: string): void {
    const disposables = this.disposables.get(panelKey);
    if (disposables) {
      disposables.forEach((d) => d.dispose());
      this.disposables.delete(panelKey);
    }
    this.panels.delete(panelKey);
  }

  dispose(): void {
    for (const [panelKey, panel] of this.panels) {
      panel.dispose();
      this.cleanupPanel(panelKey);
    }
    this.panels.clear();
    this.disposables.clear();
  }
}
