import type { MemorySummary } from '@/lib/agent/types';
import { formatObservationDate, formatProfileSource } from './observation-utils';

interface ObservationProfileSectionProps {
  memory: MemorySummary | null;
}

export default function ObservationProfileSection({ memory }: ObservationProfileSectionProps) {
  const profile = memory?.profile;
  const recentThemes = profile?.recentThemes.slice(0, 4) ?? ['暂无'];

  return (
    <section className="panel-card">
      <div className="panel-head">
        <div>
          <p className="section-label">Profile</p>
          <h2>画像与历史</h2>
        </div>
      </div>

      <div className="profile-strip">
        <ProfileChipPanel title="视觉偏好" items={profile?.visualLikes ?? []} emptyText="暂无" />
        <ProfileChipPanel title="视觉排斥" items={profile?.visualDislikes ?? []} emptyText="暂无" />
        <ProfileChipPanel title="语气偏好" items={profile?.tonePreference ? [profile.tonePreference] : []} emptyText="暂无" />
        <ProfileChipPanel title="产品偏好" items={profile?.productPreferences ?? []} emptyText="暂无" />
      </div>

      <div className="profile-strip">
        <div className="profile-strip__item">
          <span className="memory-label">近期主题</span>
          <div className="token-list">
            {recentThemes.map((item) => (
              <span key={item} className="token-chip">{item}</span>
            ))}
          </div>
        </div>
        <div className="profile-strip__item">
          <span className="memory-label">最近一次更新</span>
          <p className="soft-text">{profile ? formatObservationDate(profile.lastUpdated) : '暂无'}</p>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 10 }}>
        {(memory?.profileHistory ?? []).slice(0, 5).map((entry) => (
          <div key={entry.id} className="list-card">
            <div className="candidate-head">
              <strong>{formatProfileSource(entry.source)}</strong>
              <span className="status-pill status-pill--mocked">{formatObservationDate(entry.createdAt)}</span>
            </div>
            <div className="token-list">
              {entry.profile.visualLikes.slice(0, 3).map((like) => <span key={like} className="token-chip">{like}</span>)}
            </div>
            <p className="micro-copy">语气：{entry.profile.tonePreference || '暂无'}</p>
          </div>
        ))}
        {(memory?.profileHistory.length ?? 0) === 0 ? <p className="soft-text">还没有画像历史。</p> : null}
      </div>
    </section>
  );
}

function ProfileChipPanel({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="profile-strip__item">
      <span className="memory-label">{title}</span>
      <div className="token-list">
        {items.length > 0 ? items.slice(0, 4).map((item) => <span key={item} className="token-chip">{item}</span>) : <span className="soft-text">{emptyText}</span>}
      </div>
    </div>
  );
}
