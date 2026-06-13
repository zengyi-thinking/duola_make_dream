import type { ReactNode } from 'react';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';

export function ResultCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel-card">
      <div className="card-topline">{props.title}</div>
      <div className="stack stack--tight">{props.children}</div>
    </section>
  );
}

interface EmptyCardProps {
  title: string;
  body: string;
  /** 显示 chibi 头像做欢迎引导 */
  avatar?: boolean;
}

export function EmptyCard({ title, body, avatar }: EmptyCardProps) {
  return (
    <section className="panel-card panel-card--empty">
      {avatar && (
        <div className="empty-avatar">
          <PocketBuddyAvatar avatar="yunyun-chibi" mood="warm" size={88} />
        </div>
      )}
      <h3>{title}</h3>
      <p className="soft-text">{body}</p>
    </section>
  );
}
