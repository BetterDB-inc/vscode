import * as vscode from 'vscode';
import { SearchQueryProvider } from '../providers/SearchQueryProvider';
import { SearchIndexTreeItem, SearchTreeProvider } from '../providers/SearchTreeProvider';
import { COMMANDS } from '../utils/constants';

export function registerSearchCommands(
  context: vscode.ExtensionContext,
  searchQueryProvider: SearchQueryProvider,
  searchTreeProvider: SearchTreeProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMANDS.OPEN_SEARCH_QUERY,
      async (...args: unknown[]) => {
        const arg = args[0];

        if (arg instanceof SearchIndexTreeItem) {
          await searchQueryProvider.openOrReveal(arg.connectionId, arg.indexName);
          return;
        }

        const connectionId = searchTreeProvider.getActiveConnectionId();
        if (!connectionId) {
          vscode.window.showWarningMessage('Please connect to a database first');
          return;
        }
        await searchQueryProvider.openOrReveal(connectionId);
      }
    )
  );
}
