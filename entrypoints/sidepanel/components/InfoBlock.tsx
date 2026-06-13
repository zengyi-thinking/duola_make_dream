export function InfoBlock(props: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span className="memory-label">{props.label}</span>
      <p>{props.value}</p>
    </div>
  );
}
