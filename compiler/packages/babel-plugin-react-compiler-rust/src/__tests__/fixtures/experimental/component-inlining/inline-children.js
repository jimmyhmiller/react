// @enableComponentInlining
function Card({title, children}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Page(props) {
  return (
    <Card title={props.title}>
      <p>{props.body}</p>
      <p>footer</p>
    </Card>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Page,
  params: [{title: 't', body: 'b'}],
  sequentialRenders: [
    {title: 't', body: 'b'},
    {title: 't2', body: 'b'},
  ],
};
