import * as vscode from 'vscode';
import { ConnectionManager } from './services/ConnectionManager';
import { ConnectionTreeProvider } from './providers/ConnectionTreeProvider';
import { KeyTreeProvider } from './providers/KeyTreeProvider';
import { KeyEditorProvider } from './providers/KeyEditorProvider';
import { BrandingTreeProvider } from './providers/BrandingTreeProvider';
import {
  registerConnectionCommands,
  registerKeyCommands,
  registerCliCommands,
} from './commands';

let connectionManager: ConnectionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  connectionManager = new ConnectionManager(context);

  const connectionTreeProvider = new ConnectionTreeProvider(connectionManager);
  const keyTreeProvider = new KeyTreeProvider(connectionManager);
  const keyEditorProvider = new KeyEditorProvider(context, () => {
    keyTreeProvider.refresh();
  });

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('betterdb-connections', connectionTreeProvider),
    vscode.window.registerTreeDataProvider('betterdb-keys', keyTreeProvider),
    vscode.window.registerTreeDataProvider('betterdb-branding', new BrandingTreeProvider()),
    vscode.commands.registerCommand('betterdb.openWebsite', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://betterdb.com'));
    }),
    vscode.commands.registerCommand('betterdb.openRepo', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/betterdb-inc/vscode'));
    })
  );

  registerConnectionCommands(context, connectionManager, keyTreeProvider);
  registerKeyCommands(context, connectionManager, keyTreeProvider, keyEditorProvider);
  registerCliCommands(context, connectionManager);

  context.subscriptions.push(
    keyEditorProvider,
    {
      dispose: () => {
        connectionManager?.dispose();
      },
    }
  );

  const hasShownWelcome = context.globalState.get<boolean>('hasShownWelcome');
  if (!hasShownWelcome) {
    vscode.window
      .showInformationMessage(
        'Welcome to BetterDB for Valkey! Click the database icon in the activity bar to get started.',
        'Add Connection'
      )
      .then((selection) => {
        if (selection === 'Add Connection') {
          vscode.commands.executeCommand('betterdb.addConnection');
        }
      });
    context.globalState.update('hasShownWelcome', true);
  }
}

export function deactivate(): void {
  if (connectionManager) {
    connectionManager.dispose();
    connectionManager = undefined;
  }
}
