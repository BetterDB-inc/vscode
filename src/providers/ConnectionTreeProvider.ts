import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { ConnectionConfig } from '../models/connection.model';
import { COMMANDS } from '../utils/constants';

export class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private connectionManager: ConnectionManager) {
    connectionManager.onDidChangeConnections(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ConnectionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConnectionTreeItem): Promise<ConnectionTreeItem[]> {
    if (element) {
      return [];
    }

    const connections = await this.connectionManager.loadConnections();
    return connections.map((conn) => {
      const isConnected = this.connectionManager.isConnected(conn.id);
      const state = this.connectionManager.getState(conn.id);
      return new ConnectionTreeItem(conn, isConnected, state?.serverInfo);
    });
  }
}

export class ConnectionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly config: ConnectionConfig,
    public readonly isConnected: boolean,
    public readonly serverInfo?: { version: string; usedMemory: string }
  ) {
    super(config.name, vscode.TreeItemCollapsibleState.None);

    this.description = `${config.host}:${config.port}${config.db ? `/${config.db}` : ''}`;

    const statusText = isConnected ? 'Connected' : 'Disconnected';
    const serverDetails = serverInfo
      ? `\nVersion: ${serverInfo.version}\nMemory: ${serverInfo.usedMemory}`
      : '';

    this.tooltip = new vscode.MarkdownString(
      `**${config.name}**\n\n` +
      `Host: \`${config.host}:${config.port}\`\n\n` +
      `Database: ${config.db || 0}\n\n` +
      `Status: ${statusText}${serverDetails}`
    );

    this.iconPath = new vscode.ThemeIcon(
      isConnected ? 'database' : 'debug-disconnect',
      isConnected ? new vscode.ThemeColor('charts.green') : undefined
    );

    this.contextValue = isConnected ? 'connection-connected' : 'connection-disconnected';

    this.command = {
      command: isConnected ? COMMANDS.BROWSE_KEYS : COMMANDS.CONNECT,
      title: isConnected ? 'Browse Keys' : 'Connect',
      arguments: [this.config.id],
    };
  }
}
