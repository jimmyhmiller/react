// @enableComponentInlining
function Link(props) {
  return <a href={props.href}>{props.children}</a>;
}

function Badge({label, ...rest}) {
  return <span title={rest.title}>{label}</span>;
}

function Nav(props) {
  return (
    <nav>
      <Link href={props.href}>home</Link>
      <Badge label="new" title={props.title} />
    </nav>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Nav,
  params: [{href: '/', title: 'x'}],
  sequentialRenders: [
    {href: '/', title: 'x'},
    {href: '/a', title: 'y'},
  ],
};
