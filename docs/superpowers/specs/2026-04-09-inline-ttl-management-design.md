# Inline TTL Management — Design Spec

## Overview

Allow users to view and edit key TTL directly from the key browser tree, without opening the full key editor. Adds a context menu action and optimistic UI updates for a snappy editing experience.

## Current State

- TTL displayed in key tree item description: `"hash (TTL: 2h 30m)"`
- TTL editable only from inside the key editor webview (`setTtl` / `editTtl` messages)
- `KeyService.setTTL(key, ttl)` calls `client.expire(key, ttl)` or `client.persist(key)`
- `formatTTL()` in `src/shared/formatters.ts` handles human-readable formatting

## Design

### Edit Trigger

Context menu item "Edit TTL..." on key items in the tree (`viewItem =~ /^key-/`), alongside the existing "Delete Key" action.

### Input

`vscode.window.showInputBox()` with:
- **Value:** Pre-filled with current TTL in seconds (empty if no expiry)
- **Prompt:** `"Enter TTL in seconds (-1 to remove expiry)"`
- **Validation:**
  - Must be an integer
  - Must be >= -1
  - Reject `0` with message: `"0 would delete the key. Use -1 to remove expiry."`

### Behavior

| Input | Action | Command |
|---|---|---|
| Positive integer (e.g., `3600`) | Set TTL to N seconds | `client.expire(key, n)` |
| `-1` | Remove expiry (persist) | `client.persist(key)` |
| `0` | Rejected by validation | — |
| Cancel / Escape | No-op | — |

### Optimistic Update

1. User submits new TTL value
2. **Immediately** update the `KeyTreeItem` description with the new TTL (formatted via `formatTTL()`)
3. Fire `onDidChangeTreeData` with the specific tree item (no full tree re-scan)
4. Execute `KeyService.setTTL()` in the background
5. On success: no further action needed
6. On failure: revert the tree item description to the previous TTL, show error notification via `vscode.window.showErrorMessage()`

## Architecture

### Modified Files

- **`src/commands/key.commands.ts`** — register `betterdb.editTtl` command with input box logic and optimistic update flow
- **`src/providers/KeyTreeProvider.ts`** — expose method to update a single `KeyTreeItem`'s TTL and fire targeted `onDidChangeTreeData` event for that item only
- **`src/utils/constants.ts`** — add `COMMANDS.EDIT_TTL = 'betterdb.editTtl'`
- **`package.json`** — add command registration and context menu entry under `view/item/context` for `viewItem =~ /^key-/`

### No New Files

This feature is small enough to fit into existing files. No new services or providers needed — reuses `KeyService.setTTL()`.

## Scope Exclusions

- No millisecond precision (uses seconds, matching existing `EXPIRE` usage)
- No bulk TTL editing (one key at a time)
- No TTL presets or smart parsing (e.g., "5m", "2h") — input is raw seconds only
- No double-click-to-edit (VS Code tree API does not support inline editing)
