import * as vscode from 'vscode';

export class BetterDBError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BetterDBError';
  }
}

export enum ErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_NOT_FOUND = 'CONNECTION_NOT_FOUND',
  NOT_CONNECTED = 'NOT_CONNECTED',
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  SCAN_FAILED = 'SCAN_FAILED',
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.CONNECTION_FAILED]: 'Failed to connect to database',
  [ErrorCode.CONNECTION_TIMEOUT]: 'Connection timed out',
  [ErrorCode.CONNECTION_NOT_FOUND]: 'Connection configuration not found',
  [ErrorCode.NOT_CONNECTED]: 'Not connected to database',
  [ErrorCode.KEY_NOT_FOUND]: 'Key not found',
  [ErrorCode.OPERATION_FAILED]: 'Operation failed',
  [ErrorCode.INVALID_INPUT]: 'Invalid input',
  [ErrorCode.SCAN_FAILED]: 'Failed to scan keys',
};

export function createError(code: ErrorCode, details?: string, cause?: Error): BetterDBError {
  const baseMessage = ERROR_MESSAGES[code];
  const message = details ? `${baseMessage}: ${details}` : baseMessage;
  return new BetterDBError(message, code, cause);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof BetterDBError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function showError(error: unknown, prefix?: string): void {
  const message = getErrorMessage(error);
  const fullMessage = prefix ? `${prefix}: ${message}` : message;
  vscode.window.showErrorMessage(fullMessage);
}

export function showErrorWithRetry(
  error: unknown,
  retryAction: () => Promise<void>,
  prefix?: string
): void {
  const message = getErrorMessage(error);
  const fullMessage = prefix ? `${prefix}: ${message}` : message;

  vscode.window.showErrorMessage(fullMessage, 'Retry').then((selection) => {
    if (selection === 'Retry') {
      retryAction().catch((err) => showError(err, prefix));
    }
  });
}

export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorPrefix?: string
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    showError(error, errorPrefix);
    return undefined;
  }
}
