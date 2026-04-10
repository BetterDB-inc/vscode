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

      const allKeys = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning keys...' },
        async () => keyService.scanAllKeys(pattern, Infinity)
      );

      if (allKeys.length === 0) {
        vscode.window.showInformationMessage(`No keys found matching "${pattern}"`);
        return;
      }

      const format = await vscode.window.showQuickPick(
        [
          { label: 'Plain Text Commands', description: 'Readable .txt file, executable via valkey-cli', value: 'text' as const },
          { label: 'Binary (RDB)', description: 'JSONL with DUMP payloads for exact key replication', value: 'binary' as const },
        ],
        { placeHolder: `Export ${allKeys.length} keys matching "${pattern}"` }
      );

      if (!format) return;

      const limitInput = await vscode.window.showInputBox({
        prompt: `Export all ${allKeys.length} keys, or enter a limit`,
        value: String(allKeys.length),
        validateInput: (v) => {
          const n = parseInt(v, 10);
          if (isNaN(n) || n < 1) return 'Must be a positive number';
          return null;
        },
      });

      if (limitInput === undefined) return;
      const parsedLimit = parseInt(limitInput, 10);
      const keysToExport = parsedLimit < allKeys.length ? allKeys.slice(0, parsedLimit) : allKeys;

      const ext = format.value === 'text' ? 'txt' : 'rdb';
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`export-${pattern.replace(/[*?]/g, '_')}.${ext}`),
        filters: format.value === 'text'
          ? { 'Plain Text Export': ['txt'] }
          : { 'Binary RDB Export': ['rdb'] },
      });

      if (!uri) return;

      let exportResult: { exported: number };
      try {
        exportResult = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting keys...',
            cancellable: true,
          },
          async (progress, token) => {
            return exportKeys(client, {
              keys: keysToExport,
              pattern,
              format: format.value,
              filePath: uri.fsPath,
              onProgress: (exported, total) => {
                progress.report({
                  message: `${exported} / ${total} keys`,
                  increment: (1 / total) * 100,
                });
              },
              cancellationToken: token,
            });
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Export failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      const openAction = await vscode.window.showInformationMessage(
        `Exported ${exportResult.exported} keys to ${uri.fsPath}`,
        'Open File'
      );
      if (openAction === 'Open File') {
        vscode.commands.executeCommand('vscode.open', uri);
      }
    }),

    vscode.commands.registerCommand(COMMANDS.IMPORT_KEYS, async (arg?: string | { config?: { id: string } }) => {
      let connectionId: string | undefined;
      if (typeof arg === 'string') {
        connectionId = arg;
      } else if (arg?.config?.id) {
        connectionId = arg.config.id;
      } else {
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

      const importResult = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Importing keys...',
          cancellable: true,
        },
        async (progress, token) => {
          return importKeys(client, {
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
        }
      );

      let summary = `Imported ${importResult.imported} keys`;
      if (importResult.skipped > 0) summary += `, ${importResult.skipped} skipped`;
      if (importResult.failed > 0) summary += `, ${importResult.failed} failed`;

      const action = await vscode.window.showInformationMessage(summary, 'Refresh Key Browser');
      if (action === 'Refresh Key Browser') {
        keyTreeProvider.refresh();
      }
    })
  );
}
