import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { KeyTreeProvider } from '../providers/KeyTreeProvider';
import { exportKeys } from '../services/ExportService';
import { importKeys, ConflictStrategy } from '../services/ImportService';
import { COMMANDS } from '../utils/constants';

const LAST_EXPORT_DIR_KEY = 'betterdb.lastExportDir';

let importOutputChannel: vscode.OutputChannel | undefined;

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

      const format = await vscode.window.showQuickPick(
        [
          { label: 'Plain Text Commands', description: 'Readable .txt file, executable via valkey-cli', value: 'text' as const },
          { label: 'Binary (RDB)', description: 'JSONL with DUMP payloads for exact key replication', value: 'binary' as const },
        ],
        { placeHolder: `Export keys matching "${pattern}"` }
      );

      if (!format) return;

      const limitInput = await vscode.window.showInputBox({
        prompt: `Maximum keys to export (matching "${pattern}")`,
        value: '10000',
        validateInput: (v) => {
          const n = parseInt(v, 10);
          if (isNaN(n) || n < 1) return 'Must be a positive number';
          return null;
        },
      });

      if (limitInput === undefined) return;
      const parsedLimit = parseInt(limitInput, 10);

      let keysToExport: string[];
      try {
        keysToExport = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Scanning keys...', cancellable: true },
          async (_progress, token) => {
            return keyService.scanAllKeys(pattern, parsedLimit, () => {
              if (token.isCancellationRequested) throw new Error('cancelled');
            });
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'cancelled') return;
        vscode.window.showErrorMessage(`Scan failed: ${msg}`);
        return;
      }

      if (keysToExport.length === 0) {
        vscode.window.showInformationMessage(`No keys found matching "${pattern}"`);
        return;
      }

      const ext = format.value === 'text' ? 'txt' : 'rdb';
      const connName = connectionManager.getState(connectionId)?.config?.name ?? connectionId;
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/[_-]+$/, '');
      const sanitizedConn = sanitize(connName) || 'betterdb';
      const sanitizedPattern = sanitize(pattern) || 'all';
      const fileName = `${sanitizedConn}-${sanitizedPattern}.${ext}`;
      const lastDir = context.globalState.get<string>(LAST_EXPORT_DIR_KEY) ?? os.homedir();
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(lastDir, fileName)),
        filters: format.value === 'text'
          ? { 'Plain Text Export': ['txt'] }
          : { 'Binary RDB Export': ['rdb'] },
      });

      if (!uri) return;
      await context.globalState.update(LAST_EXPORT_DIR_KEY, path.dirname(uri.fsPath));

      let exportResult: { exported: number };
      let cancelled = false;
      try {
        exportResult = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Exporting keys...',
            cancellable: true,
          },
          async (progress, token) => {
            const result = await exportKeys(client, {
              keys: keysToExport,
              pattern,
              format: format.value,
              filePath: uri.fsPath,
              onProgress: (processed, total) => {
                progress.report({
                  message: `${processed} / ${total} keys`,
                  increment: (1 / total) * 100,
                });
              },
              cancellationToken: token,
            });
            cancelled = token.isCancellationRequested;
            return result;
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Export failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      const showFn = cancelled
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
      const summary = cancelled
        ? `Export cancelled — ${exportResult.exported} of ${keysToExport.length} keys written to ${uri.fsPath}`
        : `Exported ${exportResult.exported} keys to ${uri.fsPath}`;
      const openAction = await showFn(summary, 'Open File');
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
      const lastDir = context.globalState.get<string>(LAST_EXPORT_DIR_KEY) ?? os.homedir();
      const uris = await vscode.window.showOpenDialog({
        defaultUri: vscode.Uri.file(lastDir),
        canSelectMany: false,
        filters: { 'BetterDB Export Files': ['txt', 'rdb'] },
        openLabel: 'Import',
      });

      if (!uris || uris.length === 0) return;
      const filePath = uris[0].fsPath;
      await context.globalState.update(LAST_EXPORT_DIR_KEY, path.dirname(filePath));

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

      let importResult;
      try {
        importResult = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Importing keys...',
            cancellable: true,
          },
          async (progress, token) => {
            let lastImported = 0;
            return importKeys(client, {
              filePath,
              conflictStrategy: strategy.value,
              onProgress: (imported, total) => {
                if (total > 0) {
                  const delta = Math.max(0, imported - lastImported);
                  lastImported = imported;
                  progress.report({
                    message: `${imported} / ${total} keys`,
                    increment: (delta / total) * 100,
                  });
                } else {
                  progress.report({ message: `${imported} keys processed` });
                }
              },
              cancellationToken: token,
            });
          }
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Import failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      let summary = `Imported ${importResult.imported} keys`;
      if (importResult.skipped > 0) summary += `, ${importResult.skipped} skipped`;
      if (importResult.failed > 0) summary += `, ${importResult.failed} failed`;

      const aborted = importResult.errors.some((e) => e.includes('import aborted'));
      const errorCount = importResult.errors.length;
      const buttons: string[] = [];
      if (errorCount > 0) buttons.push('Show Details');
      buttons.push('Refresh Key Browser');

      const showFn = aborted || (importResult.imported === 0 && errorCount > 0)
        ? vscode.window.showWarningMessage
        : vscode.window.showInformationMessage;
      if (errorCount > 0 && !aborted) summary += ` (${errorCount} issue${errorCount === 1 ? '' : 's'})`;

      const action = await showFn(summary, ...buttons);
      if (action === 'Show Details') {
        if (!importOutputChannel) {
          importOutputChannel = vscode.window.createOutputChannel('BetterDB Import');
          context.subscriptions.push(importOutputChannel);
        }
        importOutputChannel.clear();
        importOutputChannel.appendLine(summary);
        importOutputChannel.appendLine('');
        for (const e of importResult.errors) importOutputChannel.appendLine(`- ${e}`);
        importOutputChannel.show();
      } else if (action === 'Refresh Key Browser') {
        keyTreeProvider.refresh();
      }
    })
  );
}
