# Inline TTL Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to edit key TTL directly from the key browser tree via context menu, with optimistic UI updates.

**Architecture:** Add a `validateTTLInput` function to validators, a `updateItemTTL` method on `KeyTreeProvider` for targeted single-item refresh, and a new `betterdb.editTtl` command in `key.commands.ts`. Wire it up in `package.json` as a context menu item on key tree nodes.

**Tech Stack:** VS Code Extension API (TreeDataProvider, showInputBox), TypeScript, Vitest

---

### Task 1: Add TTL input validation function

**Files:**
- Modify: `src/utils/validators.ts`
- Modify: `src/utils/validators.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/utils/validators.test.ts`:

```typescript
describe('validateTTLInput', () => {
  it('accepts positive integers', () => {
    expect(validateTTLInput('1')).toEqual({ valid: true });
    expect(validateTTLInput('3600')).toEqual({ valid: true });
    expect(validateTTLInput('86400')).toEqual({ valid: true });
  });

  it('accepts -1 to remove expiry', () => {
    expect(validateTTLInput('-1')).toEqual({ valid: true });
  });

  it('rejects 0 with helpful message', () => {
    const result = validateTTLInput('0');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('0 would delete the key. Use -1 to remove expiry.');
  });

  it('rejects non-integer input', () => {
    expect(validateTTLInput('abc').valid).toBe(false);
    expect(validateTTLInput('').valid).toBe(false);
    expect(validateTTLInput('3.5').valid).toBe(false);
    expect(validateTTLInput(' ').valid).toBe(false);
  });

  it('rejects values less than -1', () => {
    expect(validateTTLInput('-2').valid).toBe(false);
    expect(validateTTLInput('-100').valid).toBe(false);
  });
});
```

Also add `validateTTLInput` to the import statement at the top of the file:

```typescript
import {
  validatePort,
  validateDbIndex,
  validateConnectionName,
  validateHost,
  validateConnectionConfig,
  validateTTLInput,
} from './validators';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/validators.test.ts`
Expected: FAIL — `validateTTLInput` is not exported from `./validators`

- [ ] **Step 3: Implement validateTTLInput**

Add to the end of `src/utils/validators.ts`, before the closing of the file:

```typescript
export function validateTTLInput(value: string): ValidationResult {
  const ttl = parseInt(value, 10);
  if (isNaN(ttl) || String(ttl) !== value.trim()) {
    return { valid: false, error: 'TTL must be an integer' };
  }
  if (ttl === 0) {
    return { valid: false, error: '0 would delete the key. Use -1 to remove expiry.' };
  }
  if (ttl < -1) {
    return { valid: false, error: 'TTL must be -1 (no expiry) or a positive number of seconds' };
  }
  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/validators.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/validators.ts src/utils/validators.test.ts
git commit -m "feat: add validateTTLInput for inline TTL editing"
```

---

### Task 2: Add targeted single-item TTL update to KeyTreeProvider

**Files:**
- Modify: `src/providers/KeyTreeProvider.ts`

- [ ] **Step 1: Add `updateItemTTL` method to `KeyTreeProvider`**

Add the following method to the `KeyTreeProvider` class, after the existing `refresh()` method (line 51):

```typescript
updateItemTTL(item: KeyTreeItem, newTTL: number): void {
  const ttlText = newTTL > 0 ? ` (TTL: ${formatTTL(newTTL)})` : '';
  item.description = `${item.keyInfo.type}${ttlText}`;

  item.tooltip = new vscode.MarkdownString(
    `**${item.keyInfo.key.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1')}**\n\n` +
    `Type: \`${item.keyInfo.type}\`\n\n` +
    `TTL: ${formatTTL(newTTL)}${item.keyInfo.size ? `\nSize: ${formatBytes(item.keyInfo.size)}` : ''}${item.keyInfo.encoding ? `\nEncoding: ${item.keyInfo.encoding}` : ''}`
  );

  this._onDidChangeTreeData.fire(item);
}
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build:extension`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/providers/KeyTreeProvider.ts
git commit -m "feat: add updateItemTTL for targeted tree item refresh"
```

---

### Task 3: Add EDIT_TTL command constant

**Files:**
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: Add EDIT_TTL to COMMANDS**

In `src/utils/constants.ts`, add `EDIT_TTL` to the `COMMANDS` object, after the `REFRESH_SEARCH` entry (line 53):

```typescript
  EDIT_TTL: 'betterdb.editTtl',
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build:extension`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/utils/constants.ts
git commit -m "feat: add EDIT_TTL command constant"
```

---

### Task 4: Register editTtl command

**Files:**
- Modify: `src/commands/key.commands.ts`

- [ ] **Step 1: Add the editTtl command registration**

In `src/commands/key.commands.ts`, add the following import at the top of the file:

```typescript
import { COMMANDS } from '../utils/constants';
import { validateTTLInput } from '../utils/validators';
```

Then add the following command registration inside the `context.subscriptions.push(...)` call, after the `betterdb.addKey` registration (before the closing `);` on line 212):

```typescript
    ,

    vscode.commands.registerCommand(COMMANDS.EDIT_TTL, async (item: KeyTreeItem) => {
      const client = connectionManager.getClient(item.connectionId);
      if (!client) {
        vscode.window.showErrorMessage('Not connected to database');
        return;
      }

      const currentTTL = item.keyInfo.ttl;
      const input = await vscode.window.showInputBox({
        prompt: 'Enter TTL in seconds (-1 to remove expiry)',
        value: currentTTL > 0 ? String(currentTTL) : '',
        validateInput: (value) => {
          const result = validateTTLInput(value);
          return result.valid ? null : result.error!;
        },
      });

      if (input === undefined) return;

      const newTTL = parseInt(input, 10);
      const previousTTL = currentTTL;

      keyTreeProvider.updateItemTTL(item, newTTL);

      try {
        const keyService = new KeyService(client);
        await keyService.setTTL(item.keyInfo.key, newTTL);
      } catch (err) {
        keyTreeProvider.updateItemTTL(item, previousTTL);
        vscode.window.showErrorMessage(
          `Failed to set TTL: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    })
```

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build:extension`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/commands/key.commands.ts
git commit -m "feat: register editTtl command with optimistic update"
```

---

### Task 5: Wire up command and context menu in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add command definition**

In `package.json`, add the following to the `contributes.commands` array (find the array of command objects):

```json
{
  "command": "betterdb.editTtl",
  "title": "Edit TTL...",
  "category": "BetterDB"
}
```

- [ ] **Step 2: Hide from command palette**

Add to the `contributes.menus.commandPalette` array:

```json
{
  "command": "betterdb.editTtl",
  "when": "false"
}
```

- [ ] **Step 3: Add to key item context menu**

Add to the `contributes.menus.view/item/context` array, before the existing `betterdb.deleteKey` entry:

```json
{
  "command": "betterdb.editTtl",
  "when": "viewItem =~ /^key-/"
},
```

- [ ] **Step 4: Build the full extension**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: No errors (warnings are OK)

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add package.json
git commit -m "feat: wire up editTtl command and context menu in package.json"
```

---

### Task 6: Manual verification in Extension Development Host

- [ ] **Step 1: Launch Extension Development Host**

Press F5 in VS Code (or run the "Run Extension" launch config).

- [ ] **Step 2: Connect to a Valkey/Redis instance and browse keys**

- [ ] **Step 3: Verify context menu**

Right-click a key in the tree. Confirm "Edit TTL..." appears alongside "Delete Key".

- [ ] **Step 4: Test setting a TTL**

Click "Edit TTL...", enter `120`, press Enter. Confirm:
- Tree item description updates immediately to show `(TTL: 2m 0s)`
- The TTL is actually set on the server (verify with `TTL keyname` in CLI)

- [ ] **Step 5: Test removing expiry**

On a key with a TTL, click "Edit TTL...", enter `-1`, press Enter. Confirm:
- Tree item description updates to show no TTL
- Server confirms `TTL keyname` returns `-1`

- [ ] **Step 6: Test validation**

Click "Edit TTL...", try entering `0`. Confirm validation message appears: "0 would delete the key. Use -1 to remove expiry."

Try entering `abc`. Confirm validation message: "TTL must be an integer"

- [ ] **Step 7: Test cancel**

Click "Edit TTL...", press Escape. Confirm nothing changes.

- [ ] **Step 8: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: adjustments from manual TTL testing"
```
