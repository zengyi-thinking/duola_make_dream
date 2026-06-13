export function ListBlock(props: { items: string[]; ordered?: boolean }) {
  if (props.ordered) {
    return (
      <ol className="bullet-list">
        {props.items.map((item) => <li key={item}>{item}</li>)}
      </ol>
    );
  }

  return (
    <ul className="bullet-list bullet-list--plain">
      {props.items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
