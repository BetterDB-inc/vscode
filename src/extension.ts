import * as vscode from 'vscode';
import { ConnectionManager } from './services/ConnectionManager';
import { ConnectionTreeProvider } from './providers/ConnectionTreeProvider';
import { KeyTreeProvider } from './providers/KeyTreeProvider';
import { SearchTreeProvider } from './providers/SearchTreeProvider';
import { KeyEditorProvider } from './providers/KeyEditorProvider';
import { SearchQueryProvider } from './providers/SearchQueryProvider';
import { BrandingTreeProvider } from './providers/BrandingTreeProvider';
import { StatsViewProvider } from './providers/StatsViewProvider';
import {
  registerConnectionCommands,
  registerKeyCommands,
  registerCliCommands,
  registerExportCommands,
  registerSearchCommands,
} from './commands';
import { COMMANDS } from './utils/constants';

let connectionManager: ConnectionManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  connectionManager = new ConnectionManager(context);

  const connectionTreeProvider = new ConnectionTreeProvider(connectionManager);
  const keyTreeProvider = new KeyTreeProvider(connectionManager);
  const searchTreeProvider = new SearchTreeProvider(connectionManager);
  const keyEditorProvider = new KeyEditorProvider(context, () => {
    keyTreeProvider.refresh();
  });
  const searchQueryProvider = new SearchQueryProvider(context, connectionManager);
  const statsViewProvider = new StatsViewProvider(context.extensionUri);

  const updateStatsClient = async () => {
    const configs = await connectionManager.loadConnections();
    const connectedConfig = configs.find(c => connectionManager.isConnected(c.id));
    const client = connectedConfig ? connectionManager.getClient(connectedConfig.id) : null;
    statsViewProvider.setClient(client ?? null);
  };

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('betterdb-connections', connectionTreeProvider),
    vscode.window.registerTreeDataProvider('betterdb-keys', keyTreeProvider),
    vscode.window.registerTreeDataProvider('betterdb-search', searchTreeProvider),
    vscode.window.registerTreeDataProvider('betterdb-branding', new BrandingTreeProvider()),
    vscode.window.registerWebviewViewProvider(StatsViewProvider.viewType, statsViewProvider),
    vscode.commands.registerCommand(COMMANDS.REFRESH_STATS, () => {
      statsViewProvider.refresh();
    }),
    vscode.commands.registerCommand(COMMANDS.REFRESH_SEARCH, () => {
      searchTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('betterdb.openWebsite', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://betterdb.com?utm_source=vscode&utm_medium=extension&utm_campaign=betterdb'));
    }),
    vscode.commands.registerCommand('betterdb.openRepo', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/betterdb-inc/vscode'));
    }),
    connectionManager.onDidChangeConnections(async () => {
      updateStatsClient();
      const configs = await connectionManager.loadConnections();
      for (const config of configs) {
        if (!connectionManager.isConnected(config.id)) {
          searchQueryProvider.notifyConnectionLost(config.id);
        }
      }
    })
  );

  registerConnectionCommands(context, connectionManager, keyTreeProvider, searchTreeProvider);
  registerKeyCommands(context, connectionManager, keyTreeProvider, keyEditorProvider, searchTreeProvider);
  registerCliCommands(context, connectionManager);
  registerExportCommands(context, connectionManager, keyTreeProvider);
  registerSearchCommands(context, searchQueryProvider, searchTreeProvider);

  context.subscriptions.push(
    keyEditorProvider,
    searchQueryProvider,
    {
      dispose: () => {
        statsViewProvider.dispose();
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
