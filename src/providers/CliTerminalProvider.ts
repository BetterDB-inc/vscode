import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { CliTerminalBridge } from '../services/CliTerminalBridge';
import { CLI, STORAGE_KEYS } from '../utils/constants';

const ESCAPE_CODES = {
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  GRAY: '\x1b[90m',
  BOLD_RED: '\x1b[1;31m',
  BOLD_GREEN: '\x1b[1;32m',
  BOLD_YELLOW: '\x1b[1;33m',
  BOLD_CYAN: '\x1b[1;36m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
};

const ESCAPE_SEQ = {
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  RIGHT: '\x1b[C',
  LEFT: '\x1b[D',
  HOME: '\x1b[H',
  END: '\x1b[F',
  DELETE: '\x1b[3~',
};

const CTRL = {
  C: '\x03',
  D: '\x04',
  A: '\x01',
  E: '\x05',
  U: '\x15',
  K: '\x0b',
  W: '\x17',
  L: '\x0c',
};

const MIN_ESCAPE_SEQ_LENGTH = 2;
const MAX_ESCAPE_SEQ_LENGTH = 4;

export class CliTerminalProvider implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite = this.writeEmitter.event;

  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose = this.closeEmitter.event;

  private buffer = '';
  private history: string[] = [];
  private historyIndex = -1;
  private cursorPosition = 0;
  private escapeBuffer = '';
  private isExecuting = false;
  private currentExecution: Promise<void> | null = null;
  private isOpen = false;
  private isRegistered = false;

  constructor(
    private context: vscode.ExtensionContext,
    private connectionManager: ConnectionManager,
    private connectionId: string,
    private connectionName: string,
    private bridge: CliTerminalBridge,
    private terminal?: vscode.Terminal
  ) {
    this.loadHistory();
  }

  setTerminal(terminal: vscode.Terminal): void {
    this.terminal = terminal;
    this.tryRegister();
  }

  private tryRegister(): void {
    if (this.isRegistered || !this.isOpen || !this.terminal) return;
    this.bridge.register(this.connectionId, this, this.terminal);
    this.isRegistered = true;
  }

  async waitIdle(): Promise<void> {
    while (this.currentExecution) {
      const pending = this.currentExecution;
      try { await pending; } catch { /* ignore — already surfaced to terminal */ }
      if (this.currentExecution === pending) {
        this.currentExecution = null;
      }
    }
  }

  private loadHistory(): void {
    const allHistory = this.context.globalState.get<Record<string, string[]>>(STORAGE_KEYS.CLI_HISTORY, {});
    this.history = allHistory[this.connectionId] || [];
    this.historyIndex = this.history.length;
  }

  private saveHistory(): void {
    const allHistory = this.context.globalState.get<Record<string, string[]>>(STORAGE_KEYS.CLI_HISTORY, {});
    allHistory[this.connectionId] = this.history;
    this.context.globalState.update(STORAGE_KEYS.CLI_HISTORY, allHistory);
  }

  open(): void {
    this.write(`${ESCAPE_CODES.BOLD_CYAN}╔════════════════════════════════════════╗${ESCAPE_CODES.RESET}\r\n`);
    this.write(`${ESCAPE_CODES.BOLD_CYAN}║${ESCAPE_CODES.RESET}   BetterDB CLI - Valkey/Redis Client   ${ESCAPE_CODES.BOLD_CYAN}║${ESCAPE_CODES.RESET}\r\n`);
    this.write(`${ESCAPE_CODES.BOLD_CYAN}╚════════════════════════════════════════╝${ESCAPE_CODES.RESET}\r\n\r\n`);
    this.write(`Connected to: ${ESCAPE_CODES.BOLD_YELLOW}${this.escapeOutput(this.connectionName)}${ESCAPE_CODES.RESET}\r\n`);
    this.write('Type commands or "help" for available commands.\r\n');
    this.write('Use Ctrl+C to cancel, Ctrl+D to exit.\r\n\r\n');
    this.prompt();
    this.isOpen = true;
    this.tryRegister();
  }

  close(): void {
    this.bridge.unregister(this.connectionId, this);
    this.isRegistered = false;
    this.isOpen = false;
    this.saveHistory();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }

  handleInput(data: string): void {
    for (const char of data) {
      this.processChar(char);
    }
  }

  private processChar(char: string): void {
    if (this.escapeBuffer.length > 0) {
      this.escapeBuffer += char;

      if (this.escapeBuffer.length >= MIN_ESCAPE_SEQ_LENGTH) {
        if (this.escapeBuffer === ESCAPE_SEQ.UP) { this.navigateHistory(-1); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.DOWN) { this.navigateHistory(1); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.RIGHT) { this.moveCursorRight(); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.LEFT) { this.moveCursorLeft(); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.HOME) { this.moveCursorToStart(); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.END) { this.moveCursorToEnd(); this.escapeBuffer = ''; return; }
        if (this.escapeBuffer === ESCAPE_SEQ.DELETE) { this.deleteCharAtCursor(); this.escapeBuffer = ''; return; }

        if (this.escapeBuffer.length > MAX_ESCAPE_SEQ_LENGTH || (char >= 'A' && char <= 'Z') || char === '~') {
          this.escapeBuffer = '';
          return;
        }
      }
      return;
    }

    if (char === '\x1b') { this.escapeBuffer = '\x1b'; return; }
    if (char === '\x7f' || char === '\b') { this.deleteCharBeforeCursor(); return; }

    if (char === '\r' || char === '\n') {
      if (!this.isExecuting) {
        this.write('\r\n');
        this.currentExecution = this.executeCommand(this.buffer.trim());
        this.buffer = '';
        this.cursorPosition = 0;
      }
      return;
    }

    if (char === CTRL.C) { this.write('^C\r\n'); this.buffer = ''; this.cursorPosition = 0; this.prompt(); return; }
    if (char === CTRL.D && this.buffer.length === 0) { this.write('\r\nGoodbye!\r\n'); this.closeEmitter.fire(0); return; }
    if (char === CTRL.L) { this.write('\x1b[2J\x1b[H'); this.prompt(); this.write(this.buffer); return; }
    if (char === CTRL.A) { this.moveCursorToStart(); return; }
    if (char === CTRL.E) { this.moveCursorToEnd(); return; }
    if (char === CTRL.U) { this.buffer = ''; this.cursorPosition = 0; this.redrawLine(); return; }
    if (char === CTRL.K) { this.buffer = this.buffer.slice(0, this.cursorPosition); this.redrawLine(); return; }
    if (char === CTRL.W) { this.deleteWordBeforeCursor(); return; }
    if (char === '\t') { return; }

    if (char >= ' ' && char <= '~') {
      this.insertChar(char);
    }
  }

  private write(text: string): void {
    this.writeEmitter.fire(text);
  }

  private insertChar(char: string): void {
    this.buffer = this.buffer.slice(0, this.cursorPosition) + char + this.buffer.slice(this.cursorPosition);
    this.cursorPosition++;
    this.redrawLine();
  }

  private deleteCharBeforeCursor(): void {
    if (this.cursorPosition > 0) {
      this.buffer = this.buffer.slice(0, this.cursorPosition - 1) + this.buffer.slice(this.cursorPosition);
      this.cursorPosition--;
      this.redrawLine();
    }
  }

  private deleteCharAtCursor(): void {
    if (this.cursorPosition < this.buffer.length) {
      this.buffer = this.buffer.slice(0, this.cursorPosition) + this.buffer.slice(this.cursorPosition + 1);
      this.redrawLine();
    }
  }

  private deleteWordBeforeCursor(): void {
    if (this.cursorPosition > 0) {
      let newPos = this.cursorPosition - 1;
      while (newPos > 0 && this.buffer[newPos] === ' ') newPos--;
      while (newPos > 0 && this.buffer[newPos - 1] !== ' ') newPos--;
      this.buffer = this.buffer.slice(0, newPos) + this.buffer.slice(this.cursorPosition);
      this.cursorPosition = newPos;
      this.redrawLine();
    }
  }

  private moveCursorLeft(): void {
    if (this.cursorPosition > 0) { this.cursorPosition--; this.write('\x1b[D'); }
  }

  private moveCursorRight(): void {
    if (this.cursorPosition < this.buffer.length) { this.cursorPosition++; this.write('\x1b[C'); }
  }

  private moveCursorToStart(): void {
    if (this.cursorPosition > 0) { this.write(`\x1b[${this.cursorPosition}D`); this.cursorPosition = 0; }
  }

  private moveCursorToEnd(): void {
    if (this.cursorPosition < this.buffer.length) {
      this.write(`\x1b[${this.buffer.length - this.cursorPosition}C`);
      this.cursorPosition = this.buffer.length;
    }
  }

  private redrawLine(): void {
    this.write('\r\x1b[K');
    this.prompt();
    this.write(this.buffer);
    if (this.cursorPosition < this.buffer.length) {
      this.write(`\x1b[${this.buffer.length - this.cursorPosition}D`);
    }
  }

  private prompt(): void {
    this.write(`${ESCAPE_CODES.BOLD_GREEN}❯${ESCAPE_CODES.RESET} `);
  }

  private async executeCommand(input: string): Promise<void> {
    if (!input) { this.prompt(); return; }

    if (this.history[this.history.length - 1] !== input) {
      this.history.push(input);
      if (this.history.length > CLI.MAX_HISTORY_SIZE) this.history.shift();
      this.saveHistory();
    }
    this.historyIndex = this.history.length;

    const lowerInput = input.toLowerCase();
    if (lowerInput === 'help') { this.showHelp(); this.prompt(); return; }
    if (lowerInput === 'clear' || lowerInput === 'cls') { this.write('\x1b[2J\x1b[H'); this.prompt(); return; }
    if (lowerInput === 'exit' || lowerInput === 'quit') { this.write('Goodbye!\r\n'); this.closeEmitter.fire(0); return; }
    if (lowerInput === 'history') { this.showHistory(); this.prompt(); return; }

    const client = this.connectionManager.getClient(this.connectionId);
    if (!client) {
      this.write(`${ESCAPE_CODES.BOLD_RED}(error) Not connected${ESCAPE_CODES.RESET}\r\n`);
      this.prompt();
      return;
    }

    this.isExecuting = true;

    try {
      const parts = this.parseCommandLine(input);
      if (parts.length === 0) { this.prompt(); return; }

      const command = parts[0].toUpperCase();
      const args = parts.slice(1);
      const startTime = Date.now();
      const result = await (client as unknown as { call: (...args: unknown[]) => Promise<unknown> }).call(command, ...args);
      const duration = Date.now() - startTime;

      this.formatResult(result);
      this.write(`${ESCAPE_CODES.GRAY}(${duration}ms)${ESCAPE_CODES.RESET}\r\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.write(`${ESCAPE_CODES.BOLD_RED}(error) ${this.escapeOutput(message)}${ESCAPE_CODES.RESET}\r\n`);
    } finally {
      this.isExecuting = false;
    }

    this.prompt();
  }

  private parseCommandLine(input: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let escape = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (escape) { current += char; escape = false; continue; }
      if (char === '\\' && i + 1 < input.length) { escape = true; continue; }
      if ((char === '"' || char === "'") && !inQuotes) { inQuotes = true; quoteChar = char; }
      else if (char === quoteChar && inQuotes) { inQuotes = false; quoteChar = ''; }
      else if (char === ' ' && !inQuotes) { if (current) { parts.push(current); current = ''; } }
      else { current += char; }
    }
    if (current) parts.push(current);
    return parts;
  }

  private escapeOutput(text: string): string {
    return text.replace(/[\x00-\x1f\x7f]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code === 0x09) return '\\t';
      if (code === 0x0a) return '\\n';
      if (code === 0x0d) return '\\r';
      return `\\x${code.toString(16).padStart(2, '0')}`;
    });
  }

  private formatResult(result: unknown, indent: number = 0): void {
    const pad = '  '.repeat(indent);

    if (result === null || result === undefined) {
      this.write(`${pad}${ESCAPE_CODES.GRAY}(nil)${ESCAPE_CODES.RESET}\r\n`);
    } else if (typeof result === 'string') {
      this.write(`${pad}${ESCAPE_CODES.YELLOW}"${this.escapeOutput(result)}"${ESCAPE_CODES.RESET}\r\n`);
    } else if (typeof result === 'number') {
      this.write(`${pad}${ESCAPE_CODES.CYAN}(integer) ${result}${ESCAPE_CODES.RESET}\r\n`);
    } else if (Buffer.isBuffer(result)) {
      this.write(`${pad}${ESCAPE_CODES.YELLOW}"${this.escapeOutput(result.toString())}"${ESCAPE_CODES.RESET}\r\n`);
    } else if (Array.isArray(result)) {
      if (result.length === 0) {
        this.write(`${pad}${ESCAPE_CODES.GRAY}(empty array)${ESCAPE_CODES.RESET}\r\n`);
      } else {
        result.forEach((item, i) => {
          const num = `${i + 1})`.padEnd(4);
          if (typeof item === 'string' || Buffer.isBuffer(item)) {
            const str = Buffer.isBuffer(item) ? item.toString() : item;
            this.write(`${pad}${num}${ESCAPE_CODES.YELLOW}"${this.escapeOutput(str)}"${ESCAPE_CODES.RESET}\r\n`);
          } else if (Array.isArray(item)) {
            this.write(`${pad}${num}\r\n`);
            this.formatResult(item, indent + 1);
          } else if (typeof item === 'number') {
            this.write(`${pad}${num}${ESCAPE_CODES.CYAN}(integer) ${item}${ESCAPE_CODES.RESET}\r\n`);
          } else if (item === null) {
            this.write(`${pad}${num}${ESCAPE_CODES.GRAY}(nil)${ESCAPE_CODES.RESET}\r\n`);
          } else {
            this.write(`${pad}${num}${JSON.stringify(item)}\r\n`);
          }
        });
      }
    } else if (typeof result === 'object') {
      this.write(`${pad}${JSON.stringify(result, null, 2).replace(/\n/g, '\r\n')}\r\n`);
    } else {
      this.write(`${pad}${String(result)}\r\n`);
    }
  }

  private showHelp(): void {
    this.write(`\r\n${ESCAPE_CODES.BOLD_CYAN}BetterDB CLI Commands:${ESCAPE_CODES.RESET}\r\n\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}help${ESCAPE_CODES.RESET}          Show this help message\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}clear/cls${ESCAPE_CODES.RESET}     Clear the screen\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}history${ESCAPE_CODES.RESET}       Show command history\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}exit/quit${ESCAPE_CODES.RESET}     Close the CLI\r\n\r\n`);
    this.write(`${ESCAPE_CODES.BOLD_CYAN}Keyboard Shortcuts:${ESCAPE_CODES.RESET}\r\n\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+A${ESCAPE_CODES.RESET}        Move to start of line\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+E${ESCAPE_CODES.RESET}        Move to end of line\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+U${ESCAPE_CODES.RESET}        Clear line\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+K${ESCAPE_CODES.RESET}        Clear to end of line\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+W${ESCAPE_CODES.RESET}        Delete word before cursor\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Ctrl+L${ESCAPE_CODES.RESET}        Clear screen\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}Up/Down${ESCAPE_CODES.RESET}       Navigate history\r\n\r\n`);
    this.write(`${ESCAPE_CODES.BOLD_CYAN}Common Valkey/Redis Commands:${ESCAPE_CODES.RESET}\r\n\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}PING${ESCAPE_CODES.RESET}          Test connection\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}INFO${ESCAPE_CODES.RESET}          Server information\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}KEYS pattern${ESCAPE_CODES.RESET}  List keys matching pattern\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}GET key${ESCAPE_CODES.RESET}       Get string value\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}SET key val${ESCAPE_CODES.RESET}   Set string value\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}DEL key${ESCAPE_CODES.RESET}       Delete key\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}TYPE key${ESCAPE_CODES.RESET}      Get key type\r\n`);
    this.write(`  ${ESCAPE_CODES.BOLD}TTL key${ESCAPE_CODES.RESET}       Get key TTL\r\n\r\n`);
    this.write(`All standard Valkey/Redis commands are supported.\r\n\r\n`);
  }

  private showHistory(): void {
    if (this.history.length === 0) {
      this.write(`${ESCAPE_CODES.GRAY}(no history)${ESCAPE_CODES.RESET}\r\n`);
      return;
    }
    this.write(`\r\n${ESCAPE_CODES.BOLD_CYAN}Command History:${ESCAPE_CODES.RESET}\r\n\r\n`);
    const start = Math.max(0, this.history.length - CLI.HISTORY_DISPLAY_LIMIT);
    for (let i = start; i < this.history.length; i++) {
      const num = `${i + 1})`.padEnd(5);
      this.write(`  ${ESCAPE_CODES.GRAY}${num}${ESCAPE_CODES.RESET}${this.escapeOutput(this.history[i])}\r\n`);
    }
    this.write('\r\n');
  }

  private navigateHistory(direction: number): void {
    const newIndex = this.historyIndex + direction;
    if (newIndex < 0 || newIndex > this.history.length) return;
    this.historyIndex = newIndex;
    this.buffer = this.history[newIndex] || '';
    this.cursorPosition = this.buffer.length;
    this.redrawLine();
  }
}
