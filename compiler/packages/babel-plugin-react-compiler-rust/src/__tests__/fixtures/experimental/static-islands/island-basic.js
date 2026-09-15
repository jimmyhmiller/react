// @enableStaticIslands
// The article body has no handlers or refs, so it is wrapped in an island. The
// header's button has a handler: the header is not wrapped, but its static
// <nav> is.
function Page({title, body}) {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <header>
        <button onClick={() => setOpen(!open)}>menu</button>
        <nav>
          <a href="/docs">Docs</a>
          <a href="/blog">Blog</a>
        </nav>
      </header>
      <article>
        <h1>{title}</h1>
        <p>{body}</p>
        <p>Last updated today.</p>
      </article>
    </main>
  );
}
