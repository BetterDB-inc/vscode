import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { KeyTreeProvider, KeyTreeItem } from '../providers/KeyTreeProvider';
import { KeyEditorProvider } from '../providers/KeyEditorProvider';

export function registerKeyCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  keyTreeProvider: KeyTreeProvider,
  keyEditorProvider: KeyEditorProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('betterdb.browseKeys', (connectionId: string) => {
      keyTreeProvider.setActiveConnection(connectionId);
      vscode.commands.executeCommand('betterdb-keys.focus');
    }),

    vscode.commands.registerCommand('betterdb.filterKeys', async () => {
      const currentFilter = keyTreeProvider.getFilter();
      const pattern = await vscode.window.showInputBox({
        prompt: 'Filter pattern (supports * and ? wildcards)',
        value: currentFilter,
        placeHolder: 'e.g., user:*, session:*, *:cache',
      });

      if (pattern !== undefined) {
        keyTreeProvider.setFilter(pattern);
      }
    }),

    vscode.commands.registerCommand('betterdb.refreshKeys', () => {
      keyTreeProvider.refresh();
    }),

    vscode.commands.registerCommand(
      'betterdb.openKey',
      async (connectionId: string, key: string) => {
        const client = connectionManager.getClient(connectionId);
        if (!client) {
          vscode.window.showErrorMessage('Not connected to database');
          return;
        }

        const keyService = new KeyService(client);
        await keyEditorProvider.openKeyEditor(keyService, connectionId, key);
      }
    ),

    vscode.commands.registerCommand('betterdb.deleteKey', async (item: KeyTreeItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete key "${item.keyInfo.key}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm === 'Delete') {
        const client = connectionManager.getClient(item.connectionId);
        if (client) {
          const keyService = new KeyService(client);
          await keyService.deleteKey(item.keyInfo.key);
          keyTreeProvider.refresh();
          vscode.window.showInformationMessage(`Key "${item.keyInfo.key}" deleted`);
        }
      }
    }),

    vscode.commands.registerCommand('betterdb.addKey', async () => {
      const connectionId = keyTreeProvider.getActiveConnectionId();
      if (!connectionId) {
        vscode.window.showWarningMessage('Please connect to a database first');
        return;
      }

      const client = connectionManager.getClient(connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database');
        return;
      }

      const type = await vscode.window.showQuickPick(
        [
          { label: 'String', value: 'string', description: 'Simple key-value pair' },
          { label: 'Hash', value: 'hash', description: 'Field-value pairs' },
          { label: 'List', value: 'list', description: 'Ordered collection of strings' },
          { label: 'Set', value: 'set', description: 'Unordered unique strings' },
          { label: 'Sorted Set', value: 'zset', description: 'Scored unique strings' },
        ],
        { placeHolder: 'Select key type' }
      );

      if (!type) return;

      const key = await vscode.window.showInputBox({
        prompt: 'Key name',
        validateInput: (value) => (value.trim() ? null : 'Key name is required'),
      });

      if (!key) return;

      const keyService = new KeyService(client);

      const exists = await keyService.keyExists(key);
      if (exists) {
        const overwrite = await vscode.window.showWarningMessage(
          `Key "${key}" already exists. Overwrite?`,
          { modal: true },
          'Overwrite'
        );
        if (overwrite !== 'Overwrite') return;
      }

      try {
        switch (type.value) {
          case 'string': {
            const value = await vscode.window.showInputBox({
              prompt: 'Value',
              placeHolder: 'Enter the string value',
            });
            if (value === undefined) return;
            await keyService.setString(key, value);
            break;
          }

          case 'hash': {
            const field = await vscode.window.showInputBox({
              prompt: 'Field name',
              validateInput: (v) => (v.trim() ? null : 'Field name is required'),
            });
            if (!field) return;
            const value = await vscode.window.showInputBox({
              prompt: 'Field value',
            });
            if (value === undefined) return;
            await keyService.hashSet(key, field, value);
            break;
          }

          case 'list': {
            const value = await vscode.window.showInputBox({
              prompt: 'First element',
              placeHolder: 'Enter the first list element',
            });
            if (value === undefined) return;
            await keyService.listPush(key, value, 'right');
            break;
          }

          case 'set': {
            const value = await vscode.window.showInputBox({
              prompt: 'First member',
              validateInput: (v) => (v.trim() ? null : 'Member is required'),
            });
            if (!value) return;
            await keyService.setAdd(key, [value]);
            break;
          }

          case 'zset': {
            const member = await vscode.window.showInputBox({
              prompt: 'First member',
              validateInput: (v) => (v.trim() ? null : 'Member is required'),
            });
            if (!member) return;
            const scoreStr = await vscode.window.showInputBox({
              prompt: 'Score',
              value: '0',
              validateInput: (v) => (isNaN(parseFloat(v)) ? 'Invalid score' : null),
            });
            if (scoreStr === undefined) return;
            await keyService.zsetAdd(key, [{ score: parseFloat(scoreStr), member }]);
            break;
          }
        }

        keyTreeProvider.refresh();
        vscode.window.showInformationMessage(`Key "${key}" created`);

        await keyEditorProvider.openKeyEditor(keyService, connectionId, key);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to create key: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    })
  );
}
