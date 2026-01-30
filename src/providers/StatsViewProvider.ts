import * as vscode from 'vscode';
import Valkey from 'iovalkey';
import { StatsService } from '../services/StatsService';
import { ServerStats } from '../models/stats.model';
import { escapeHtml } from '../utils/helpers';

export class StatsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'betterdb.statsView';

  private view?: vscode.WebviewView;
  private client: Valkey | null = null;
  private refreshInterval?: NodeJS.Timeout;
  private readonly REFRESH_INTERVAL_MS = 5000;

  constructor(private readonly extensionUri: vscode.Uri) { }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });

    webviewView.onDidDispose(() => {
      this.stopAutoRefresh();
    });

    this.updateView();

    if (webviewView.visible && this.client) {
      this.startAutoRefresh();
    }
  }

  setClient(client: Valkey | null): void {
    this.client = client;

    if (client && this.view?.visible) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }

    this.updateView();
  }

  async refresh(): Promise<void> {
    await this.updateView();
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    if (this.client) {
      console.log('[StatsView] Starting auto-refresh');
      this.refreshInterval = setInterval(() => {
        this.updateView();
      }, this.REFRESH_INTERVAL_MS);
      this.updateView();
    }
  }

  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      console.log('[StatsView] Stopping auto-refresh');
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private async updateView(): Promise<void> {
    if (!this.view) {
      return;
    }

    if (!this.client) {
      this.view.webview.html = this.getDisconnectedHtml();
      return;
    }

    try {
      const statsService = new StatsService(this.client);
      const stats = await statsService.getServerStats();
      this.view.webview.html = this.getStatsHtml(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.view.webview.html = this.getErrorHtml(message);
    }
  }

  private getStyleUri(): vscode.Uri {
    return this.view!.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'stats.css')
    );
  }

  private getDisconnectedHtml(): string {
    const styleUri = this.getStyleUri();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="message">
    <p>No connection active</p>
    <p class="message-subtitle">Connect to a database to view server stats</p>
  </div>
</body>
</html>`;
  }

  private getErrorHtml(error: string): string {
    const styleUri = this.getStyleUri();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="error">
    <p>Failed to fetch stats</p>
    <p class="error-message">${escapeHtml(error)}</p>
  </div>
</body>
</html>`;
  }

  private getStatsHtml(stats: ServerStats): string {
    const styleUri = this.getStyleUri();
    const hitRate = stats.keyspaceHits + stats.keyspaceMisses > 0
      ? ((stats.keyspaceHits / (stats.keyspaceHits + stats.keyspaceMisses)) * 100).toFixed(1)
      : '0.0';

    const uptime = this.formatUptime(stats.uptimeSeconds);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div class="header">
    <span class="badge">${escapeHtml(stats.version)}</span>
    <span class="badge role-badge">${escapeHtml(stats.role)}</span>
    <span class="uptime">Up: ${escapeHtml(uptime)}</span>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-label">Connected</div>
      <div class="card-value">${this.formatNumber(stats.connectedClients)}</div>
      <div class="card-subtitle">${stats.blockedClients} blocked</div>
    </div>

    <div class="card">
      <div class="card-label">Memory</div>
      <div class="card-value">${escapeHtml(stats.usedMemoryHuman)}</div>
      <div class="card-subtitle">peak: ${escapeHtml(stats.usedMemoryPeakHuman)}</div>
    </div>

    <div class="card">
      <div class="card-label">Ops/Sec</div>
      <div class="card-value">${this.formatNumber(stats.opsPerSec)}</div>
    </div>

    <div class="card">
      <div class="card-label">Hit Rate</div>
      <div class="card-value">${hitRate}%</div>
    </div>

    <div class="card">
      <div class="card-label">Total Keys</div>
      <div class="card-value">${this.formatNumber(stats.totalKeys)}</div>
    </div>

    <div class="card">
      <div class="card-label">Evicted</div>
      <div class="card-value">${this.formatNumber(stats.evictedKeys)}</div>
    </div>
  </div>

  <div class="footer">
    <div class="refresh-note">Auto-refreshes every 5s (pauses when collapsed)</div>
    <div class="promo">
      <div class="promo-title">Need deeper insights?</div>
      <div class="promo-text">
        Check out <a href="https://betterdb.com">BetterDB</a> for advanced monitoring,
        alerts, and performance analytics.
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days}d ${hours}h`;
  }

  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  dispose(): void {
    this.stopAutoRefresh();
  }
}
