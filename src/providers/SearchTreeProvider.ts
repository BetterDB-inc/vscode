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

type SearchTreeItem = SearchRootItem | FtIndexItem | FtFieldItem;

class SearchRootItem extends vscode.TreeItem {
  constructor() {
    super('Search Indexes', vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('search');
    this.contextValue = 'search-root';
  }
}

class FtIndexItem extends vscode.TreeItem {
  constructor(public readonly info: FtIndexInfo) {
    super(info.name, vscode.TreeItemCollapsibleState.Collapsed);
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
      this.refresh();
    }
  }

  clear(): void {
    this.activeConnectionId = null;
    this.keyService = null;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SearchTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SearchTreeItem): Promise<SearchTreeItem[]> {
    if (!this.keyService || !this.activeConnectionId) {
      vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false);
      return [];
    }

    if (!element) {
      try {
        const hasSearch = await this.keyService.hasSearchModule();
        vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', hasSearch);
        return hasSearch ? [new SearchRootItem()] : [];
      } catch {
        vscode.commands.executeCommand('setContext', 'betterdb.hasSearchModule', false);
        return [];
      }
    }

    if (element instanceof SearchRootItem) {
      try {
        const indexes = await this.keyService.getSearchIndexList();
        if (indexes.length === 0) {
          const empty = new vscode.TreeItem('No indexes found');
          empty.iconPath = new vscode.ThemeIcon('info');
          return [empty as SearchTreeItem];
        }
        const items: FtIndexItem[] = [];
        for (const name of indexes) {
          try {
            const info = await this.keyService.getSearchIndexInfo(name);
            items.push(new FtIndexItem(info));
          } catch {
            const errorItem = new FtIndexItem({
              name,
              numDocs: 0,
              indexingState: 'indexing',
              percentIndexed: 0,
              fields: [],
              indexOn: 'HASH',
              prefixes: [],
            });
            errorItem.description = 'failed to load';
            items.push(errorItem);
          }
        }
        return items;
      } catch (err) {
        showError(err, 'Failed to load search indexes');
        const errorItem = new vscode.TreeItem('Failed to load indexes');
        errorItem.iconPath = new vscode.ThemeIcon('error');
        return [errorItem as SearchTreeItem];
      }
    }

    if (element instanceof FtIndexItem) {
      return element.info.fields.map((field) => new FtFieldItem(field));
    }

    return [];
  }
}
