import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { KeyService } from '../services/KeyService';
import { KeyInfo } from '../models/key.model';
import { TYPE_ICONS, SCAN_COUNT, DISPLAY_LIMIT, COMMANDS } from '../utils/constants';
import { formatTTL, formatBytes } from '../utils/helpers';
import { showError } from '../utils/errors';

export class KeyTreeProvider implements vscode.TreeDataProvider<KeyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KeyTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private activeConnectionId: string | null = null;
  private keyService: KeyService | null = null;
  private filterPattern: string = '*';
  private isLoading: boolean = false;
  private cachedItems: KeyTreeItem[] = [];

  constructor(private connectionManager: ConnectionManager) { }

  setActiveConnection(connectionId: string): void {
    const client = this.connectionManager.getClient(connectionId);
    if (client) {
      if (this.keyService) {
        this.keyService.cancelScan();
      }
      this.activeConnectionId = connectionId;
      this.keyService = new KeyService(client);
      this.cachedItems = [];
      this.refresh();
    }
  }

  getActiveConnectionId(): string | null {
    return this.activeConnectionId;
  }

  setFilter(pattern: string): void {
    this.filterPattern = pattern || '*';
    this.cachedItems = [];
    this.refresh();
  }

  getFilter(): string {
    return this.filterPattern;
  }

  refresh(): void {
    this.cachedItems = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  updateItemTTL(item: KeyTreeItem, newTTL: number): void {
    item.keyInfo.ttl = newTTL;
    item.description = buildKeyDescription(item.keyInfo);
    item.tooltip = buildKeyTooltip(item.keyInfo);
    this._onDidChangeTreeData.fire(item);
  }

  clear(): void {
    if (this.keyService) {
      this.keyService.cancelScan();
    }
    this.activeConnectionId = null;
    this.keyService = null;
    this.filterPattern = '*';
    this.cachedItems = [];
    this.isLoading = false;
    this.refresh();
  }

  getTreeItem(element: KeyTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KeyTreeItem): Promise<KeyTreeItem[]> {
    if (!this.keyService || !this.activeConnectionId) {
      return [];
    }

    if (element) {
      return [];
    }

    if (this.isLoading) {
      return this.cachedItems.length > 0 ? this.cachedItems : [this.createLoadingItem()];
    }

    this.isLoading = true;

    try {

      const keys = await vscode.window.withProgress(
        {
          location: { viewId: 'betterdb-keys' },
          title: 'Scanning keys...',
        },
        async (progress) => {
          return this.keyService!.scanAllKeys(this.filterPattern, SCAN_COUNT, (scanned) => {
            progress.report({ message: `Found ${scanned} keys...` });
          });
        }
      );

      const uniqueKeys = [...new Set(keys)];
      const limitedKeys = uniqueKeys.slice(0, DISPLAY_LIMIT);

      const keyInfos = await Promise.all(
        limitedKeys.map((key) => this.keyService!.getKeyInfo(key))
      );

      const items = keyInfos
        .filter((info): info is KeyInfo => info !== null)
        .map((info) => new KeyTreeItem(info, this.activeConnectionId!));

      if (uniqueKeys.length > DISPLAY_LIMIT) {
        items.push(
          new KeyTreeItem(
            {
              key: `... and ${uniqueKeys.length - DISPLAY_LIMIT} more keys`,
              type: 'unknown',
              ttl: -1,
            },
            this.activeConnectionId!,
            true
          )
        );
      }

      if (items.length === 0) {
        items.push(this.createEmptyItem());
      }

      this.cachedItems = items;
      return items;
    } catch (err) {
      showError(err, 'Failed to load keys');
      this.cachedItems = [this.createErrorItem()];
      return this.cachedItems;
    } finally {
      this.isLoading = false;
    }
  }

  private createLoadingItem(): KeyTreeItem {
    const item = new KeyTreeItem(
      { key: 'Loading keys...', type: 'unknown', ttl: -1 },
      this.activeConnectionId || '',
      true
    );
    item.iconPath = new vscode.ThemeIcon('loading~spin');
    return item;
  }

  private createEmptyItem(): KeyTreeItem {
    const item = new KeyTreeItem(
      { key: 'No keys found', type: 'unknown', ttl: -1 },
      this.activeConnectionId || '',
      true
    );
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }

  private createErrorItem(): KeyTreeItem {
    const item = new KeyTreeItem(
      { key: 'Failed to load keys', type: 'unknown', ttl: -1 },
      this.activeConnectionId || '',
      true
    );
    item.iconPath = new vscode.ThemeIcon('error');
    return item;
  }
}

export class KeyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly keyInfo: KeyInfo,
    public readonly connectionId: string,
    isPlaceholder: boolean = false
  ) {
    super(keyInfo.key, vscode.TreeItemCollapsibleState.None);

    if (isPlaceholder) {
      this.iconPath = new vscode.ThemeIcon('ellipsis');
      this.contextValue = 'key-placeholder';
      return;
    }

    this.iconPath = new vscode.ThemeIcon(TYPE_ICONS[keyInfo.type] || 'key');
    this.description = buildKeyDescription(keyInfo);
    this.tooltip = buildKeyTooltip(keyInfo);
    this.contextValue = `key-${keyInfo.type}`;

    this.command = {
      command: COMMANDS.OPEN_KEY,
      title: 'Open Key',
      arguments: [connectionId, keyInfo.key],
    };
  }

}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
}

function buildKeyDescription(keyInfo: KeyInfo): string {
  const ttlText = keyInfo.ttl > 0 ? ` (TTL: ${formatTTL(keyInfo.ttl)})` : '';
  return `${keyInfo.type}${ttlText}`;
}

function buildKeyTooltip(keyInfo: KeyInfo): vscode.MarkdownString {
  const sizeText = keyInfo.size ? `\nSize: ${formatBytes(keyInfo.size)}` : '';
  const encodingText = keyInfo.encoding ? `\nEncoding: ${keyInfo.encoding}` : '';
  return new vscode.MarkdownString(
    `**${escapeMarkdown(keyInfo.key)}**\n\n` +
    `Type: \`${keyInfo.type}\`\n\n` +
    `TTL: ${formatTTL(keyInfo.ttl)}${sizeText}${encodingText}`
  );
}
