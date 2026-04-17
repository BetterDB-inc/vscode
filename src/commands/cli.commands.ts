import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { CliTerminalBridge } from '../services/CliTerminalBridge';
import { CliTerminalProvider } from '../providers/CliTerminalProvider';
import { ConnectionTreeItem } from '../providers/ConnectionTreeProvider';

export function registerCliCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  bridge: CliTerminalBridge
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('betterdb.openCli', async (item?: ConnectionTreeItem | string) => {
      let connectionId: string;
      let connectionName: string;

      if (typeof item === 'string') {
        connectionId = item;
        const configs = await connectionManager.loadConnections();
        const config = configs.find(c => c.id === connectionId);
        connectionName = config?.name || 'Unknown';
      } else if (item?.config) {
        connectionId = item.config.id;
        connectionName = item.config.name;
      } else {
        // Called from command palette - find connected databases
        const configs = await connectionManager.loadConnections();
        const connectedConfigs = configs.filter(c => connectionManager.isConnected(c.id));

        if (connectedConfigs.length === 0) {
          vscode.window.showErrorMessage('No connected databases. Please connect first.');
          return;
        }

        if (connectedConfigs.length === 1) {
          connectionId = connectedConfigs[0].id;
          connectionName = connectedConfigs[0].name;
        } else {
          const picked = await vscode.window.showQuickPick(
            connectedConfigs.map(c => ({ label: c.name, id: c.id })),
            { placeHolder: 'Select a connection' }
          );
          if (!picked) return;
          connectionId = picked.id;
          connectionName = picked.label;
        }
      }

      const client = connectionManager.getClient(connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database. Please connect first.');
        return;
      }

      const pty = new CliTerminalProvider(context, connectionManager, connectionId, connectionName, bridge);
      const terminal = vscode.window.createTerminal({
        name: `BetterDB: ${connectionName}`,
        pty,
        iconPath: new vscode.ThemeIcon('terminal'),
      });
      pty.setTerminal(terminal);
      terminal.show();
    })
  );
}
