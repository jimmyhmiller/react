import React from 'react';
import {Page as OriginalPage} from '../bookshop/Page.jsx';
import {
  getBook,
  getAuthor,
  getStores,
  getStock,
  getReviews,
  getReviewer,
} from '../bookshop/data.js';

async function warm({bookId = 'tidal-atlas'}) {
  const book = await getBook(bookId);
  if (!book) return;
  await Promise.all([
    getAuthor(book.authorId),
    getStores().then(stores =>
      Promise.all(stores.map(store => getStock(book.id, store.id)))
    ),
    getReviews(book.id).then(reviews =>
      Promise.all(reviews.map(review => getReviewer(review.reviewerId)))
    ),
    ...book.relatedIds.map(async id => {
      const related = await getBook(id);
      if (related) await getAuthor(related.authorId);
    }),
  ]);
}

// Consume data only in the original components; observe speculative failures.
export function Page(props) {
  warm(props).catch(() => {});
  return <OriginalPage {...props} />;
}
