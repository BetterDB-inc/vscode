import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { FtIndexInfo, FtFieldInfo } from '../shared/types';
import { showError } from '../utils/errors';

const FIELD_ICONS: Record<string, string> = {
  TEXT: 'symbol-key',
  TAG: 'tag',
  NUMERIC: 'symbol-numeric',
  VECTOR: 'circuit-board',
  GEO: 'globe',
  GEOSHAPES: 'globe',
};

type SearchTreeItem = SearchIndexTreeItem | FtFieldItem;

export class SearchIndexTreeItem extends vscode.TreeItem {
  readonly indexName: string;

  constructor(public readonly info: FtIndexInfo, public readonly connectionId: string) {
    super(info.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.indexName = info.name;
    this.iconPath = new vscode.ThemeIcon('list-tree');
    this.description = `${info.numDocs} doc${info.numDocs !== 1 ? 's' : ''} \u00b7 ${info.indexingState}`;
    this.contextValue = 'search-index';
  }
}

class FtFieldItem extends vscode.TreeItem {
  constructor(field: FtFieldInfo) {
    super(field.name, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(FIELD_ICONS[field.type] || 'symbol-key');
    if (field.type === 'VECTOR') {
      const parts = ['VECTOR'];
      if (field.vectorDimension) parts.push(`${field.vectorDimension}d`);
      if (field.vectorDistanceMetric) parts.push(field.vectorDistanceMetric);
      this.description = `[${parts.join(' ')}]`;
    } else {
      this.description = `[${field.type}]`;
    }
    this.contextValue = 'search-field';
  }
}

export class SearchTreeProvider implements vscode.TreeDataProvider<SearchTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SearchTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeConnectionId: string | null = null;
  private keyService: KeyService | null = null;

  constructor(private connectionManager: ConnectionManager) {}

  setActiveConnection(connectionId: string): void {
    const client = this.connectionManager.getClient(connectionId);
    if (client) {
      this.activeConnectionId = connectionId;
      this.keyService = new KeyService(client);
      this.keyService.hasSearchModule().then(
        (has) => vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', has),
        () => vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false)
      );
      this.refresh();
    }
  }

  getActiveConnectionId(): string | null {
    return this.activeConnectionId;
  }

  clear(): void {
    this.activeConnectionId = null;
    this.keyService = null;
    vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false);
    this.refresh();
  }

  refresh(): void {
    this.keyService?.clearFtCache();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SearchTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SearchTreeItem): Promise<SearchTreeItem[]> {
    if (!this.keyService || !this.activeConnectionId) {
      await vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false);
      return [];
    }

    if (!element) {
      try {
        const hasSearch = await this.keyService.hasSearchModule();
        await vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', hasSearch);
        if (!hasSearch) return [];
        const indexes = await this.keyService.getSearchIndexList();
        if (indexes.length === 0) {
          const empty = new vscode.TreeItem('No indexes found');
          empty.iconPath = new vscode.ThemeIcon('info');
          return [empty as SearchTreeItem];
        }
        const items: SearchIndexTreeItem[] = [];
        for (const name of indexes) {
          try {
            const info = await this.keyService.getSearchIndexInfo(name);
            items.push(new SearchIndexTreeItem(info, this.activeConnectionId!));
          } catch {
            const errorItem = new SearchIndexTreeItem({
              name,
              numDocs: 0,
              indexingState: 'indexing',
              percentIndexed: 0,
              fields: [],
              indexOn: 'HASH',
              prefixes: [],
            }, this.activeConnectionId!);
            errorItem.description = 'failed to load';
            items.push(errorItem);
          }
        }
        return items;
      } catch (err) {
        await vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false);
        showError(err, 'Failed to load search indexes');
        const errorItem = new vscode.TreeItem('Failed to load indexes');
        errorItem.iconPath = new vscode.ThemeIcon('error');
        return [errorItem as SearchTreeItem];
      }
    }

    if (element instanceof SearchIndexTreeItem) {
      return element.info.fields.map((field) => new FtFieldItem(field));
    }

    return [];
  }
}
