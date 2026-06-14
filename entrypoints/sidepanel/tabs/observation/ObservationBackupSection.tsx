import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import type { MemorySummary } from '@/lib/agent/types';
import { compareStateBackups } from '@/lib/agent/insights';
import { flushRuntimeConfigWrites, restoreStateBackup, saveStateBackup } from '@/lib/storage/local';
import { CollapsibleCard } from '../../components/CollapsibleCard';
import { InfoBlock } from '../../components/InfoBlock';

interface ObservationBackupSectionProps {
  memory: MemorySummary | null;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshWorkspace: () => Promise<void>;
  resetWorkspaceState: () => void;
}

export default function ObservationBackupSection(props: ObservationBackupSectionProps) {
  const {
    memory,
    busyAction,
    setBusyAction,
    setErrorText,
    setNoticeText,
    refreshWorkspace,
    resetWorkspaceState,
  } = props;

  const [backupLabel, setBackupLabel] = useState('手动快照');
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const latestBackups = memory?.stateBackups ?? [];
  const backupComparison = useMemo(() => {
    if (latestBackups.length < 2) return null;
    return compareStateBackups(latestBackups[0], latestBackups[1]);
  }, [latestBackups]);

  async function handleCreateBackup() {
    setBusyAction('backup-create');
    try {
      await flushRuntimeConfigWrites();
      const backup = await saveStateBackup(backupLabel.trim() || '手动快照');
      setNoticeText(`已创建快照：${backup.label}`);
      await refreshWorkspace();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '创建快照失败');
    } finally {
      setBusyAction('');
    }
  }

  async function handleRestoreBackup(backupId: string) {
    if (confirmRestoreId !== backupId) {
      setConfirmRestoreId(backupId);
      return;
    }

    setBusyAction(`backup-restore-${backupId}`);
    try {
      await flushRuntimeConfigWrites();
      await restoreStateBackup(backupId);
      setNoticeText('已恢复快照，当前状态已回滚。');
      resetWorkspaceState();
      await refreshWorkspace();
      setConfirmRestoreId(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '恢复快照失败');
    } finally {
      setBusyAction('');
      setConfirmRestoreId(null);
    }
  }

  return (
    <CollapsibleCard
      sectionLabel="Backup"
      title="备份与回滚"
      summary="快照、回滚、差异对比。"
      badge={`${memory?.stateBackups.length ?? 0} snapshots`}
    >
      <div className="settings-section">
        <label>快照名称</label>
        <input
          type="text"
          className="settings-input"
          value={backupLabel}
          onChange={(e) => setBackupLabel(e.target.value)}
          placeholder="手动快照"
        />
      </div>

      <div className="inline-actions">
        <LineButton variant="primary" onClick={handleCreateBackup} disabled={Boolean(busyAction)}>
          创建快照
        </LineButton>
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        {(memory?.stateBackups ?? []).map((backup) => (
          <div key={backup.id} className="list-card">
            <div className="candidate-head">
              <strong>{backup.label}</strong>
              <span className="timeline-badge timeline-badge--backup">{formatDate(backup.createdAt)}</span>
            </div>
            <p className="micro-copy">
              画像 {backup.snapshot.profileHistory.length} ·
              记忆 {backup.snapshot.archiveNotes.length} ·
              创意 {backup.snapshot.ideaHistory.length} ·
              流水线 {backup.snapshot.pipelineRuns?.length ?? 0} ·
              补丁 {backup.snapshot.harnessPatches.length}
            </p>
            <div className="inline-actions">
              <LineButton
                variant={confirmRestoreId === backup.id ? 'primary' : 'ghost'}
                onClick={() => handleRestoreBackup(backup.id)}
                disabled={Boolean(busyAction)}
              >
                {confirmRestoreId === backup.id ? '确认回滚' : '恢复这份快照'}
              </LineButton>
            </div>
          </div>
        ))}
        {(memory?.stateBackups.length ?? 0) === 0 ? <p className="soft-text">还没有快照。</p> : null}
      </div>

      {backupComparison ? (
        <div className="list-card" style={{ marginTop: 10 }}>
          <div className="candidate-head">
            <strong>最近两份快照差异</strong>
            <span className="status-pill status-pill--spark">compare</span>
          </div>
          <p className="micro-copy">{backupComparison.summary}</p>
          <div className="detail-grid">
            <InfoBlock label="较新快照" value={backupComparison.leftLabel} />
            <InfoBlock label="较旧快照" value={backupComparison.rightLabel} />
          </div>
          <div className="token-list">
            {backupComparison.changes.slice(0, 3).map((change, index) => (
              <span key={`${index}-${change}`} className="token-chip">{shorten(change, 18)}</span>
            ))}
          </div>
          <details className="reading-accordion" style={{ marginTop: 10 }}>
            <summary>展开差异明细 ({backupComparison.changes.length})</summary>
            <div className="subsection">
              <ol className="bullet-list">
                {backupComparison.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
              </ol>
            </div>
          </details>
        </div>
      ) : (
        <p className="soft-text" style={{ marginTop: 8 }}>至少保存两份快照后，这里会自动显示回滚差异。</p>
      )}
    </CollapsibleCard>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function shorten(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
