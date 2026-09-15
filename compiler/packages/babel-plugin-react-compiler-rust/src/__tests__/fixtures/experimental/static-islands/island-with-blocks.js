// @enableStaticIslands @enableJsxBlocks
// The content of an island is compiled into a block.
function Card({title, body}) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="card">
      <button onClick={() => setLiked(!liked)}>{liked ? 'Liked' : 'Like'}</button>
      <section className="body">
        <h3>{title}</h3>
        <p>{body}</p>
      </section>
    </div>
  );
}
