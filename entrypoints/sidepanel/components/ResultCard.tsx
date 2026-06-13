import type { ReactNode } from 'react';

export function ResultCard(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel-card">
      <div className="card-topline">{props.title}</div>
      <div className="stack stack--tight">{props.children}</div>
    </section>
  );
}

export function EmptyCard(props: { title: string; body: string }) {
  return (
    <section className="panel-card panel-card--empty">
      <h3>{props.title}</h3>
      <p className="soft-text">{props.body}</p>
    </section>
  );
}
