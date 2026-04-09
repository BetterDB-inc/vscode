import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { KeyTreeProvider } from '../providers/KeyTreeProvider';
import { exportKeys } from '../services/ExportService';
import { importKeys, ConflictStrategy } from '../services/ImportService';
import { COMMANDS } from '../utils/constants';

export function registerExportCommands(
  context: vscode.ExtensionContext,
  connectionManager: ConnectionManager,
  keyTreeProvider: KeyTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.EXPORT_KEYS, async () => {
      const connectionId = keyTreeProvider.getActiveConnectionId();
      if (!connectionId) {
        vscode.window.showWarningMessage('Please connect to a database and browse keys first');
        return;
      }

      const client = connectionManager.getClient(connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database');
        return;
      }

      const pattern = keyTreeProvider.getFilter();
      const keyService = new KeyService(client);

      // Count keys matching pattern
      const countResult = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Counting keys...' },
        async () => {
          const keys = await keyService.scanAllKeys(pattern, Infinity);
          return keys.length;
        }
      );

      if (countResult === 0) {
        vscode.window.showInformationMessage(`No keys found matching "${pattern}"`);
        return;
      }

      // Format picker
      const format = await vscode.window.showQuickPick(
        [
          { label: 'Plain Text Commands', description: 'Readable .txt file, executable via valkey-cli', value: 'text' as const },
          { label: 'Binary (RDB)', description: 'JSONL with DUMP payloads for exact key replication', value: 'binary' as const },
        ],
        { placeHolder: `Export ${countResult} keys matching "${pattern}"` }
      );

      if (!format) return;

      // Limit option
      let limit: number | undefined;
      const limitInput = await vscode.window.showInputBox({
        prompt: `Export all ${countResult} keys, or enter a limit`,
        value: String(countResult),
        validateInput: (v) => {
          const n = parseInt(v, 10);
          if (isNaN(n) || n < 1) return 'Must be a positive number';
          return null;
        },
      });

      if (limitInput === undefined) return;
      const parsedLimit = parseInt(limitInput, 10);
      if (parsedLimit < countResult) {
        limit = parsedLimit;
      }

      // Save dialog
      const ext = format.value === 'text' ? 'txt' : 'rdb';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`export-${pattern.replace(/[*?]/g, '_')}.${ext}`),
        filters: format.value === 'text'
          ? { 'Plain Text Export': ['txt'] }
          : { 'Binary RDB Export': ['rdb'] },
      });

      if (!uri) return;

      // Export with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Exporting keys...',
          cancellable: true,
        },
        async (progress, token) => {
          const result = await exportKeys(client, {
            pattern,
            format: format.value,
            filePath: uri.fsPath,
            limit,
            onProgress: (exported, total) => {
              progress.report({
                message: `${exported} / ${total} keys`,
                increment: (1 / total) * 100,
              });
            },
            cancellationToken: token,
          });

          const openAction = await vscode.window.showInformationMessage(
            `Exported ${result.exported} keys to ${uri.fsPath}`,
            'Open File'
          );
          if (openAction === 'Open File') {
            vscode.commands.executeCommand('vscode.open', uri);
          }
        }
      );
    }),

    vscode.commands.registerCommand(COMMANDS.IMPORT_KEYS, async (connectionId?: string) => {
      if (!connectionId) {
        connectionId = keyTreeProvider.getActiveConnectionId() ?? undefined;
      }
      if (!connectionId) {
        vscode.window.showWarningMessage('Please connect to a database first');
        return;
      }

      const client = connectionManager.getClient(connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database');
        return;
      }

      // File picker
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'BetterDB Export Files': ['txt', 'rdb'] },
        openLabel: 'Import',
      });

      if (!uris || uris.length === 0) return;
      const filePath = uris[0].fsPath;

      // Conflict strategy
      const strategy = await vscode.window.showQuickPick(
        [
          { label: 'Skip', description: 'Keep existing keys, skip duplicates', value: 'skip' as ConflictStrategy },
          { label: 'Overwrite', description: 'Replace existing keys with imported values', value: 'overwrite' as ConflictStrategy },
          { label: 'Abort', description: 'Cancel import if any conflicts found', value: 'abort' as ConflictStrategy },
        ],
        { placeHolder: 'How should existing keys be handled?' }
      );

      if (!strategy) return;

      // Import with progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Importing keys...',
          cancellable: true,
        },
        async (progress, token) => {
          const result = await importKeys(client, {
            filePath,
            conflictStrategy: strategy.value,
            onProgress: (imported, total) => {
              if (total > 0) {
                progress.report({
                  message: `${imported} / ${total} keys`,
                  increment: (1 / total) * 100,
                });
              } else {
                progress.report({ message: `${imported} keys processed` });
              }
            },
            cancellationToken: token,
          });

          let summary = `Imported ${result.imported} keys`;
          if (result.skipped > 0) summary += `, ${result.skipped} skipped`;
          if (result.failed > 0) summary += `, ${result.failed} failed`;

          const action = await vscode.window.showInformationMessage(summary, 'Refresh Key Browser');
          if (action === 'Refresh Key Browser') {
            keyTreeProvider.refresh();
          }
        }
      );
    })
  );
}
