import { useEffect, useMemo, useState } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import type { MemorySummary, ProductArtifact } from '@/lib/agent/types';
import { compareGeneratedImages, compareProductArtifacts, type VersionComparison } from '@/lib/agent/insights';
import type { GeneratedImageRecord } from '@/lib/image/types';
import { CollapsibleCard } from '../../components/CollapsibleCard';
import { InfoBlock } from '../../components/InfoBlock';

interface ObservationCompareSectionProps {
  memory: MemorySummary | null;
  artifactHistory: ProductArtifact[];
  imageHistory: GeneratedImageRecord[];
  onCopy: (text: string, successText: string) => void;
}

export default function ObservationCompareSection(props: ObservationCompareSectionProps) {
  const {
    memory,
    artifactHistory,
    imageHistory,
    onCopy,
  } = props;

  const [artifactCompareLeftId, setArtifactCompareLeftId] = useState('');
  const [artifactCompareRightId, setArtifactCompareRightId] = useState('');
  const [imageCompareLeftId, setImageCompareLeftId] = useState('');
  const [imageCompareRightId, setImageCompareRightId] = useState('');

  const effectiveArtifactHistory = artifactHistory.length > 0
    ? artifactHistory
    : (memory?.recentArtifacts ?? []);
  const effectiveImageHistory = imageHistory.length > 0
    ? imageHistory
    : (memory?.generatedImages ?? []);

  const artifactComparison = useMemo(() => {
    const left = effectiveArtifactHistory.find((item) => item.id === artifactCompareLeftId) ?? effectiveArtifactHistory[0];
    const right = effectiveArtifactHistory.find((item) => item.id === artifactCompareRightId)
      ?? effectiveArtifactHistory[1]
      ?? effectiveArtifactHistory[0];
    if (!left || !right || left.id === right.id) return null;
    return compareProductArtifacts(left, right);
  }, [artifactCompareLeftId, artifactCompareRightId, effectiveArtifactHistory]);

  const imageComparison = useMemo(() => {
    const left = effectiveImageHistory.find((item) => item.id === imageCompareLeftId) ?? effectiveImageHistory[0];
    const right = effectiveImageHistory.find((item) => item.id === imageCompareRightId)
      ?? effectiveImageHistory[1]
      ?? effectiveImageHistory[0];
    if (!left || !right || left.id === right.id) return null;
    return compareGeneratedImages(left, right);
  }, [effectiveImageHistory, imageCompareLeftId, imageCompareRightId]);

  useEffect(() => {
    if (effectiveArtifactHistory.length > 1) {
      if (!effectiveArtifactHistory.some((item) => item.id === artifactCompareLeftId)) {
        setArtifactCompareLeftId(effectiveArtifactHistory[0].id);
      }
      if (!effectiveArtifactHistory.some((item) => item.id === artifactCompareRightId)) {
        setArtifactCompareRightId(effectiveArtifactHistory[1].id);
      }
    }
  }, [artifactCompareLeftId, artifactCompareRightId, effectiveArtifactHistory]);

  useEffect(() => {
    if (effectiveImageHistory.length > 1) {
      if (!effectiveImageHistory.some((item) => item.id === imageCompareLeftId)) {
        setImageCompareLeftId(effectiveImageHistory[0].id);
      }
      if (!effectiveImageHistory.some((item) => item.id === imageCompareRightId)) {
        setImageCompareRightId(effectiveImageHistory[1].id);
      }
    }
  }, [effectiveImageHistory, imageCompareLeftId, imageCompareRightId]);

  return (
    <CollapsibleCard
      sectionLabel="Version Compare"
      title="版本对比"
      summary="产物和图片的变化压缩成两张卡。"
      badge="compare"
    >
      {effectiveArtifactHistory.length > 0 ? (
        <div className="detail-grid">
          <div className="settings-section">
            <label>产物版本 A</label>
            <select
              className="settings-select"
              value={artifactCompareLeftId}
              onChange={(e) => setArtifactCompareLeftId(e.target.value)}
            >
              {effectiveArtifactHistory.map((item) => (
                <option key={item.id} value={item.id}>{describeArtifactVersion(item)}</option>
              ))}
            </select>
          </div>
          <div className="settings-section">
            <label>产物版本 B</label>
            <select
              className="settings-select"
              value={artifactCompareRightId}
              onChange={(e) => setArtifactCompareRightId(e.target.value)}
            >
              {effectiveArtifactHistory.map((item) => (
                <option key={item.id} value={item.id}>{describeArtifactVersion(item)}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <p className="soft-text" style={{ marginTop: 8 }}>暂无产物历史，先发一个想法再来对比版本。</p>
      )}

      {artifactComparison ? (
        <CompareCard
          title="产物差异"
          badge="artifact"
          comparison={artifactComparison}
          onCopy={() => onCopy([artifactComparison.summary, ...artifactComparison.changes].join('\n'), '产物对比摘要已复制。')}
        />
      ) : (
        <p className="soft-text" style={{ marginTop: 8 }}>至少保留两版产物后，才能对比版本变化。</p>
      )}

      {effectiveImageHistory.length > 0 ? (
        <div className="detail-grid" style={{ marginTop: 12 }}>
          <div className="settings-section">
            <label>图片版本 A</label>
            <select
              className="settings-select"
              value={imageCompareLeftId}
              onChange={(e) => setImageCompareLeftId(e.target.value)}
            >
              {effectiveImageHistory.map((item) => (
                <option key={item.id} value={item.id}>{describeImageVersion(item)}</option>
              ))}
            </select>
          </div>
          <div className="settings-section">
            <label>图片版本 B</label>
            <select
              className="settings-select"
              value={imageCompareRightId}
              onChange={(e) => setImageCompareRightId(e.target.value)}
            >
              {effectiveImageHistory.map((item) => (
                <option key={item.id} value={item.id}>{describeImageVersion(item)}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <p className="soft-text" style={{ marginTop: 8 }}>暂无图片历史，先生成一张图片再来对比版本。</p>
      )}

      {imageComparison ? (
        <CompareCard
          title="图片差异"
          badge="image"
          comparison={imageComparison}
          onCopy={() => onCopy([imageComparison.summary, ...imageComparison.changes].join('\n'), '图片对比摘要已复制。')}
        />
      ) : (
        <p className="soft-text" style={{ marginTop: 8 }}>至少保留两条图片请求后，才能对比版本变化。</p>
      )}
    </CollapsibleCard>
  );
}

function CompareCard({
  title,
  badge,
  comparison,
  onCopy,
}: {
  title: string;
  badge: string;
  comparison: VersionComparison;
  onCopy: () => void;
}) {
  return (
    <div className="list-card" style={{ marginTop: 10 }}>
      <div className="candidate-head">
        <strong>{title}</strong>
        <span className="status-pill status-pill--spark">{badge}</span>
      </div>
      <p className="micro-copy">{comparison.summary}</p>
      <div className="detail-grid">
        <InfoBlock label="版本 A" value={comparison.leftLabel} />
        <InfoBlock label="版本 B" value={comparison.rightLabel} />
      </div>
      <div className="token-list">
        {comparison.changes.slice(0, 3).map((change, index) => (
          <span key={`${index}-${change}`} className="token-chip">{shorten(change, 18)}</span>
        ))}
      </div>
      <details className="reading-accordion" style={{ marginTop: 10 }}>
        <summary>展开差异明细 ({comparison.changes.length})</summary>
        <div className="subsection">
          <ol className="bullet-list">
            {comparison.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
          </ol>
        </div>
      </details>
      <div className="inline-actions">
        <LineButton variant="ghost" onClick={onCopy}>
          复制摘要
        </LineButton>
      </div>
    </div>
  );
}

function describeArtifactVersion(item: ProductArtifact) {
  return `${shorten(item.concept.name || '未命名产物', 16)} · ${item.intent} · ${formatDate(item.createdAt)}`;
}

function describeImageVersion(item: GeneratedImageRecord) {
  return `${shorten(item.request.title || item.request.sourceType || '未命名图片', 16)} · ${item.request.style} · ${formatDate(item.createdAt)}`;
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
