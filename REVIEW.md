---
phase: pocketbuddy-p0-review
reviewed: 2026-06-13T10:09:14.1060040Z
depth: deep
files_reviewed: 31
files_reviewed_list:
  - docs/agent-target-v2.md
  - package.json
  - entrypoints/sidepanel/App.tsx
  - entrypoints/sidepanel/tabs/SettingsTab.tsx
  - entrypoints/sidepanel/tabs/ArchiveTab.tsx
  - entrypoints/sidepanel/tabs/ObservationTab.tsx
  - entrypoints/sidepanel/tabs/CreativeTab.tsx
  - entrypoints/sidepanel/tabs/ReadingTab.tsx
  - components/PocketBuddyAvatar/PocketBuddyAvatar.tsx
  - components/PocketBuddyAvatar/PocketBuddyAvatar.css
  - lib/storage/local.ts
  - lib/storage/schema.ts
  - lib/brand/avatars.ts
  - lib/agent/types.ts
  - lib/memory/store.ts
  - lib/messaging/bus.ts
  - entrypoints/background.ts
  - entrypoints/sidepanel/App.css
  - components/AnimatedTree/AnimatedTree.tsx
  - components/AnimatedTree/AnimatedTree.css
  - components/Aurora/Aurora.tsx
  - components/Aurora/Aurora.css
  - components/InkRipple/InkRipple.tsx
  - components/InkRipple/InkRipple.css
  - components/PocketBurst/PocketBurst.tsx
  - components/PocketBurst/PocketBurst.css
  - components/StaggerStack/StaggerStack.tsx
  - components/TabIndicator/TabIndicator.tsx
  - components/TabIndicator/TabIndicator.css
  - lib/ui/motion-presets.ts
  - lib/ui/reduced-motion.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase PocketBuddy P0 Re-Review

**Reviewed:** 2026-06-13T10:09:14.1060040Z
**Depth:** deep
**Files Reviewed:** 31
**Status:** issues_found

## Summary

I rechecked the PocketBuddy sidepanel flow against the prior regressions and the P0 requirements doc. The requested fixes are mostly present: `avatarId` now has a default fallback, generation flows route back to Observation, and clear-all now wipes the persisted storage state and resets the App workspace state. `npm run compile` and `npm run build` both pass.

Verdict: **fail**. The runtimeConfig queue is serialized, but the destructive/snapshot flows still are not fully exclusive, so a late settings edit can race with clear-all, restore, or backup creation.

## Warnings

### WR-01: Runtime config writes can still race with clear-all / restore

**File:** `entrypoints/sidepanel/tabs/SettingsTab.tsx:37-66`

**Issue:** `flushRuntimeConfigWrites()` only drains writes that already existed when the destructive action started. Because the settings inputs remain editable and `updateField()` has no `busyAction` guard, a new `updateRuntimeConfig()` can be queued after the flush and land after `deleteMemory('all')` or `restoreStateBackup()`, reintroducing stale config. The same gap exists on the restore path in `entrypoints/sidepanel/tabs/ObservationTab.tsx:81-102`.

**Fix:**
```tsx
const configLocked = Boolean(busyAction);

async function updateField<K extends keyof RuntimeConfig>(key: K, value: RuntimeConfig[K]) {
  if (!config || configLocked) return;
  ...
}

<input disabled={configLocked} ... />
<select disabled={configLocked} ... />
```
Also guard the destructive flows with the same lock so no new runtimeConfig write can start until the operation finishes.

### WR-02: Backup creation can snapshot stale runtimeConfig

**File:** `entrypoints/sidepanel/tabs/ObservationTab.tsx:68-74`

**Issue:** `handleCreateBackup()` calls `saveStateBackup()` directly. That reads storage immediately, so a pending runtimeConfig write can be omitted from the backup snapshot and the restore later will not include the latest settings.

**Fix:**
```tsx
async function handleCreateBackup() {
  setBusyAction('backup-create');
  try {
    await flushRuntimeConfigWrites();
    const backup = await saveStateBackup(backupLabel.trim() || '手动快照');
    ...
  } finally {
    setBusyAction('');
  }
}
```

---

_Reviewed: 2026-06-13T10:09:14.1060040Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
