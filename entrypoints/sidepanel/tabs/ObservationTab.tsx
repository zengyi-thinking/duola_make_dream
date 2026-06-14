import type { Dispatch, SetStateAction } from 'react';
import type { MemorySummary, RuntimeConfig, ProductArtifact } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import ObservationOverview from './observation/ObservationOverview';
import ObservationTimelineSection from './observation/ObservationTimelineSection';
import ObservationProfileSection from './observation/ObservationProfileSection';
import ObservationBackupSection from './observation/ObservationBackupSection';
import ObservationCompareSection from './observation/ObservationCompareSection';
import ObservationLibrarySection from './observation/ObservationLibrarySection';

interface ObservationTabProps {
  memory: MemorySummary | null;
  runtimeConfig: RuntimeConfig | null;
  artifactHistory: ProductArtifact[];
  imageHistory: GeneratedImageRecord[];
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshWorkspace: () => Promise<void>;
  resetWorkspaceState: () => void;
  onCopy: (text: string, successText: string) => void;
}

export default function ObservationTab(props: ObservationTabProps) {
  const {
    memory,
    runtimeConfig,
    artifactHistory,
    imageHistory,
    busyAction,
    setBusyAction,
    setErrorText,
    setNoticeText,
    refreshWorkspace,
    resetWorkspaceState,
    onCopy,
  } = props;

  return (
    <div className="tab-panel">
      <ObservationOverview memory={memory} runtimeConfig={runtimeConfig} />
      <div className="observation-grid">
        <ObservationTimelineSection memory={memory} />
        <ObservationProfileSection memory={memory} />
      </div>
      <div className="observation-grid">
        <ObservationBackupSection
          memory={memory}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setErrorText={setErrorText}
          setNoticeText={setNoticeText}
          refreshWorkspace={refreshWorkspace}
          resetWorkspaceState={resetWorkspaceState}
        />
        <ObservationCompareSection
          memory={memory}
          artifactHistory={artifactHistory}
          imageHistory={imageHistory}
          onCopy={onCopy}
        />
      </div>
      <ObservationLibrarySection
        memory={memory}
        busyAction={busyAction}
        setBusyAction={setBusyAction}
        setErrorText={setErrorText}
        setNoticeText={setNoticeText}
        refreshWorkspace={refreshWorkspace}
        onCopy={onCopy}
      />
    </div>
  );
}
