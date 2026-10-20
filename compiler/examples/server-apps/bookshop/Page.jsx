import {getAuthor, getBook, getReviews, getReviewer, getStock, getStores} from './data.js';

const panel = {borderTop: '1px solid #d9d5c9', paddingTop: 24, marginTop: 28};

async function Author({authorId}) {
  const author = await getAuthor(authorId);
  if (!author) return <p>Author information is unavailable.</p>;
  return <section style={panel} aria-label="About the author">
    <h2>About {author.name}</h2>
    <p>{author.bio}</p>
    <small>Based in {author.hometown}</small>
  </section>;
}

async function Availability({bookId}) {
  const stores = await getStores();
  const locations = await Promise.all(stores.map(async store => ({
    store,
    stock: await getStock(bookId, store.id),
  })));
  const available = locations.some(location => location.stock && location.stock.quantity > 0);
  return <section style={panel} aria-label="Store availability">
    <h2>Find your copy</h2>
    <p>{available ? 'Available for pickup at your neighborhood bookshop.' : 'Currently unavailable for pickup. Please check back soon.'}</p>
    <ul style={{paddingLeft: 20, lineHeight: 1.9}}>
      {locations.map(({store, stock}) => <li key={store.id}>
        <strong>{store.name}</strong> — {store.address}: {' '}
        {!stock ? 'Stock information unavailable' : stock.quantity > 0 ? `${stock.quantity} copies in stock` : 'Out of stock'}
      </li>)}
    </ul>
  </section>;
}

async function Review({review}) {
  const reviewer = await getReviewer(review.reviewerId);
  return <article style={{marginTop: 20}}>
    <h3>{review.title}</h3>
    <p aria-label={`${review.rating} out of 5 stars`}>{review.rating}/5 stars</p>
    <p>{review.body}</p>
    {reviewer ? <small>{reviewer.name} · {reviewer.location} · {reviewer.reviewCount} reviews</small> : <small>Community reader</small>}
  </article>;
}

async function Reviews({bookId}) {
  const reviews = await getReviews(bookId);
  const average = reviews.length ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1) : null;
  return <section style={panel} aria-label="Customer reviews">
    <h2>From our readers</h2>
    {average ? <p>{average}/5 from {reviews.length} reader reviews</p> : <p>No reviews yet. Your next favorite read could start the conversation.</p>}
    {reviews.map(review => <Review key={review.id} review={review} />)}
  </section>;
}

async function RelatedTitle({bookId}) {
  const book = await getBook(bookId);
  if (!book) return null;
  const author = await getAuthor(book.authorId);
  return <li style={{marginBottom: 12}}>
    <a href={`?bookId=${encodeURIComponent(book.id)}`}>{book.title}</a>
    <div>{author ? author.name : 'Author unknown'} · ${book.price.toFixed(2)} · {book.format}</div>
  </li>;
}

function RelatedTitles({ids}) {
  if (!ids.length) return null;
  return <section style={panel} aria-label="Related titles">
    <h2>Keep a good story going</h2>
    <ul>{ids.map(id => <RelatedTitle key={id} bookId={id} />)}</ul>
  </section>;
}

export async function Page({bookId = 'tidal-atlas'}) {
  const book = await getBook(bookId);
  return <main style={{maxWidth: 820, margin: '40px auto', padding: '28px 36px', background: '#faf8f1', color: '#23392e', fontFamily: 'Georgia, serif', lineHeight: 1.6}}>
    <header style={{letterSpacing: 2, fontSize: 14}}>LEAF & LANTERN · INDEPENDENT BOOKSELLERS</header>
    {!book ? <section style={panel}>
      <h1>That book is off our shelves</h1>
      <p>We could not find a book with that reference.</p>
      <a href="?bookId=tidal-atlas">Discover The Tidal Atlas</a>
    </section> : <>
      <p style={{marginTop: 32}}>{book.category} / A shelf worth exploring</p>
      <h1 style={{fontSize: 44, lineHeight: 1.15, marginBottom: 16}}>{book.title}</h1>
      <p>{book.description}</p>
      <p><strong>${book.price.toFixed(2)}</strong> · {book.format}</p>
      <Author authorId={book.authorId} />
      <Availability bookId={book.id} />
      <Reviews bookId={book.id} />
      <RelatedTitles ids={book.relatedIds} />
    </>}
    <footer style={panel}>Good books. Local shelves. A little room to wander.</footer>
  </main>;
}
