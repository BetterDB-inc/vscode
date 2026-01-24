import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { CliTerminalProvider } from '../providers/CliTerminalProvider';
import { ConnectionTreeItem } from '../providers/ConnectionTreeProvider';

export function registerCliCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('betterdb.openCli', async (item: ConnectionTreeItem | string) => {
      let connectionId: string;
      let connectionName: string;

      if (typeof item === 'string') {
        connectionId = item;
        const configs = await connectionManager.loadConnections();
        const config = configs.find(c => c.id === connectionId);
        connectionName = config?.name || 'Unknown';
      } else {
        connectionId = item.config.id;
        connectionName = item.config.name;
      }

      const client = connectionManager.getClient(connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database. Please connect first.');
        return;
      }

      const pty = new CliTerminalProvider(context, connectionManager, connectionId, connectionName);
      const terminal = vscode.window.createTerminal({
        name: `BetterDB: ${connectionName}`,
        pty,
        iconPath: new vscode.ThemeIcon('terminal'),
      });

      terminal.show();
    })
  );
}
