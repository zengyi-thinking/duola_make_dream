---
phase: pocketbuddy-p0-review
reviewed: 2026-06-13T10:20:36.5365008Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - entrypoints/sidepanel/App.tsx
  - entrypoints/sidepanel/tabs/SettingsTab.tsx
  - entrypoints/sidepanel/tabs/ObservationTab.tsx
  - components/PocketBuddyAvatar/PocketBuddyAvatar.tsx
  - lib/storage/local.ts
  - lib/brand/avatars.ts
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase PocketBuddy P0 Re-Review

**Reviewed:** 2026-06-13T10:20:36.5365008Z
**Depth:** deep
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The storage queue and the new flush-before-clear/restore/backup flow look correct. `npm run compile` passes, and the original runtimeConfig race is closed by the busy-action lock in Settings plus the pre-destructive flushes.

Verdict: **fail**. There are still async messaging paths in the sidepanel that do not clear `busyAction` if `browser.runtime.sendMessage` rejects, and the initial workspace refresh has no rejection handler.

## Warnings

### WR-01: Runtime message rejection can strand the App busy state

**File:** `entrypoints/sidepanel/App.tsx:62-110`

**Issue:** `refreshWorkspace()` is fired from `useEffect` without a rejection handler, and `handleGenerateImage()` / `handleGenerateMindmap()` clear `busyAction` only after awaited runtime messages. If `sendRuntimeMessage(...)` rejects, the startup refresh becomes an unhandled promise rejection and the generate flow can leave the sidepanel stuck in a busy state.

**Fix:**
```tsx
useEffect(() => {
  void refreshWorkspace().catch((err) => {
    setErrorText(err instanceof Error ? err.message : '读取状态失败。');
  });
}, []);

async function handleGenerateImage(input: Parameters<typeof createImageGenerateMessage>[0]) {
  setBusyAction(`image-${input.style}`);
  setErrorText('');
  try {
    const response = await sendRuntimeMessage(createImageGenerateMessage(input));
    if (!response.success) {
      setErrorText(response.error ?? '图片请求生成失败。');
      return;
    }
    setMemory(response.payload.memorySummary);
    setNoticeText('图片请求已生成。');
    setActiveTab('observation');
  } finally {
    setBusyAction('');
  }
}
```

### WR-02: Observation deletes still miss cleanup on rejected messaging

**File:** `entrypoints/sidepanel/tabs/ObservationTab.tsx:106-127`

**Issue:** `deleteApprovedMemory()`, `deleteImage()`, and `deleteMindmap()` set `busyAction` before awaiting `sendRuntimeMessage(...)`, but they clear it only on the success path. If the message promise rejects, the cleanup is skipped and the tab stays disabled until reload.

**Fix:**
```tsx
async function deleteImage(imageId: string) {
  setBusyAction(`image-delete-${imageId}`);
  try {
    const response = await sendRuntimeMessage(createImageDeleteMessage(imageId));
    if (!response.success) {
      setErrorText(response.error ?? '删除图片记录失败。');
      return;
    }
    await refreshMemory();
    setNoticeText('图片生成记录已删除。');
  } catch (err) {
    setErrorText(err instanceof Error ? err.message : '删除图片记录失败。');
  } finally {
    setBusyAction('');
  }
}
```

---

_Reviewed: 2026-06-13T10:20:36.5365008Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
