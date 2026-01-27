import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { ConnectionTreeItem } from '../providers/ConnectionTreeProvider';
import { KeyTreeProvider } from '../providers/KeyTreeProvider';
import { ConnectionConfig } from '../models/connection.model';
import { generateId } from '../utils/helpers';
import { DEFAULT_CONNECTION, CLI } from '../utils/constants';
import { showError } from '../utils/errors';
import { validatePort, validateDbIndex } from '../utils/validators';

interface ConnectionFormData {
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
}

async function promptConnectionName(defaultValue: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Connection name',
    value: defaultValue,
    validateInput: (value) => (value.trim() ? null : 'Name is required'),
  });
}

async function promptHost(defaultValue: string): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Host',
    value: defaultValue,
    validateInput: (value) => (value.trim() ? null : 'Host is required'),
  });
}

async function promptPort(defaultValue: number): Promise<number | undefined> {
  const portStr = await vscode.window.showInputBox({
    prompt: 'Port',
    value: String(defaultValue),
    validateInput: (value) => {
      const result = validatePort(value);
      return result.valid ? null : result.error!;
    },
  });
  return portStr ? parseInt(portStr) : undefined;
}

async function promptUsername(defaultValue: string): Promise<string | undefined> {
  const username = await vscode.window.showInputBox({
    prompt: 'Username (optional)',
    value: defaultValue,
    placeHolder: defaultValue ? undefined : 'Leave empty for no authentication',
  });
  return username?.trim() || undefined;
}

async function promptPassword(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'Password (optional)',
    password: true,
    placeHolder: 'Leave empty for no authentication',
  });
}

async function promptDbIndex(defaultValue: number): Promise<number | undefined> {
  const dbStr = await vscode.window.showInputBox({
    prompt: 'Database index (0-255)',
    value: String(defaultValue),
    validateInput: (value) => {
      const result = validateDbIndex(value);
      return result.valid ? null : result.error!;
    },
  });
  return dbStr !== undefined ? parseInt(dbStr) : undefined;
}

async function promptTls(defaultValue: boolean): Promise<boolean | undefined> {
  const options = defaultValue ? ['Yes', 'No'] : ['No', 'Yes'];
  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: 'Use TLS/SSL?',
  });
  if (choice === undefined) return undefined;
  return choice === 'Yes';
}

async function collectConnectionForm(defaults: Partial<ConnectionFormData>): Promise<ConnectionFormData | undefined> {
  const name = await promptConnectionName(defaults.name || 'Local Valkey');
  if (!name) return undefined;

  const host = await promptHost(defaults.host || DEFAULT_CONNECTION.host);
  if (!host) return undefined;

  const port = await promptPort(defaults.port || DEFAULT_CONNECTION.port);
  if (port === undefined) return undefined;

  const username = await promptUsername(defaults.username || '');

  const db = await promptDbIndex(defaults.db ?? DEFAULT_CONNECTION.db);
  if (db === undefined) return undefined;

  const tls = await promptTls(defaults.tls ?? false);
  if (tls === undefined) return undefined;

  return { name: name.trim(), host: host.trim(), port, username, db, tls };
}

export function registerConnectionCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  keyTreeProvider: KeyTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('betterdb.addConnection', async () => {
      const form = await collectConnectionForm({});
      if (!form) return;

      const password = await promptPassword();

      await connectionManager.saveConnection({
        id: generateId(),
        ...form,
        password: password || undefined,
        connectionTimeout: DEFAULT_CONNECTION.connectionTimeout,
      });

      vscode.window.showInformationMessage(`Connection "${form.name}" saved`);
    }),

    vscode.commands.registerCommand('betterdb.connect', async (connectionId: string) => {
      try {
        const configs = await connectionManager.loadConnections();
        const config = configs.find((c) => c.id === connectionId);
        const connectionName = config?.name || 'database';

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Connecting to ${connectionName}...`,
            cancellable: true,
          },
          async (progress, token) => {
            const connectPromise = connectionManager.connect(connectionId);

            let lastPercentage = 0;
            const timeout = config?.connectionTimeout || DEFAULT_CONNECTION.connectionTimeout;
            const startTime = Date.now();

            const interval = setInterval(() => {
              const elapsed = Date.now() - startTime;
              const percentage = Math.min((elapsed / timeout) * 100, CLI.MAX_PROGRESS_PERCENTAGE);
              const increment = percentage - lastPercentage;
              lastPercentage = percentage;

              progress.report({
                increment,
                message: `Establishing connection... (${Math.round(elapsed / 1000)}s)`,
              });
            }, CLI.PROGRESS_INTERVAL_MS);

            token.onCancellationRequested(() => {
              clearInterval(interval);
              connectionManager.disconnect(connectionId);
            });

            try {
              await connectPromise;
            } finally {
              clearInterval(interval);
            }
          }
        );

        keyTreeProvider.setActiveConnection(connectionId);
        vscode.commands.executeCommand('betterdb-keys.focus');
        vscode.window.showInformationMessage(`Connected to ${connectionName}`);
      } catch (err) {
        showError(err, 'Connection failed');
      }
    }),

    vscode.commands.registerCommand('betterdb.disconnect', async (item: ConnectionTreeItem) => {
      await connectionManager.disconnect(item.config.id);
      keyTreeProvider.clear();
      vscode.window.showInformationMessage('Disconnected');
    }),

    vscode.commands.registerCommand('betterdb.editConnection', async (item: ConnectionTreeItem) => {
      const config = item.config;

      const form = await collectConnectionForm({
        name: config.name,
        host: config.host,
        port: config.port,
        username: config.username,
        db: config.db,
        tls: config.tls,
      });
      if (!form) return;

      const changePassword = await vscode.window.showQuickPick(['Keep existing', 'Change password'], {
        placeHolder: 'Password',
      });
      if (changePassword === undefined) return;

      let password: string | undefined = config.password;
      if (changePassword === 'Change password') {
        password = await vscode.window.showInputBox({
          prompt: 'New password (leave empty to remove)',
          password: true,
        });
      }

      const updatedConfig: ConnectionConfig = {
        ...config,
        ...form,
        password,
      };

      await connectionManager.saveConnection(updatedConfig);
      vscode.window.showInformationMessage(`Connection "${form.name}" updated`);
    }),

    vscode.commands.registerCommand('betterdb.deleteConnection', async (item: ConnectionTreeItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete connection "${item.config.name}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        await connectionManager.deleteConnection(item.config.id);
        keyTreeProvider.clear();
        vscode.window.showInformationMessage(`Connection "${item.config.name}" deleted`);
      }
    })
  );
}
