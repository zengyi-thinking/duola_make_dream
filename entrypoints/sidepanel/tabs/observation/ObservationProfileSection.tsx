import type { MemorySummary } from '@/lib/agent/types';
import { InfoBlock } from '../../components/InfoBlock';
import { formatObservationDate, formatProfileSource } from './observation-utils';

interface ObservationProfileSectionProps {
  memory: MemorySummary | null;
}

export default function ObservationProfileSection({ memory }: ObservationProfileSectionProps) {
  return (
    <section className="panel-card">
      <div className="panel-head">
        <div>
          <p className="section-label">Profile</p>
          <h2>当前画像与历史</h2>
        </div>
      </div>

      <div className="detail-grid">
        <InfoBlock label="视觉偏好" value={memory?.profile.visualLikes.join(' / ') || '暂无'} />
        <InfoBlock label="视觉排斥" value={memory?.profile.visualDislikes.join(' / ') || '暂无'} />
        <InfoBlock label="语气偏好" value={memory?.profile.tonePreference || '暂无'} />
        <InfoBlock label="产品偏好" value={memory?.profile.productPreferences.join(' / ') || '暂无'} />
        <InfoBlock label="近期主题" value={memory?.profile.recentThemes.join(' / ') || '暂无'} />
        <InfoBlock label="最后更新" value={memory ? formatObservationDate(memory.profile.lastUpdated) : '暂无'} />
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        {(memory?.profileHistory ?? []).map((entry) => (
          <div key={entry.id} className="list-card">
            <div className="candidate-head">
              <strong>{formatProfileSource(entry.source)}</strong>
              <span className="status-pill status-pill--mocked">{formatObservationDate(entry.createdAt)}</span>
            </div>
            <div className="token-list">
              {entry.profile.visualLikes.slice(0, 4).map((like) => <span key={like} className="token-chip">{like}</span>)}
            </div>
            <p className="micro-copy">
              语气：{entry.profile.tonePreference || '暂无'} ·
              产品偏好：{entry.profile.productPreferences.slice(0, 3).join(' / ') || '暂无'}
            </p>
          </div>
        ))}
        {(memory?.profileHistory.length ?? 0) === 0 ? <p className="soft-text">还没有画像历史。</p> : null}
      </div>
    </section>
  );
}
