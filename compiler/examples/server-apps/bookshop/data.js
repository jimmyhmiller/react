import {cache} from 'react';
import {request} from './backend.js';

// Primitive cache keys let independently composed server components share reads
// within a render request. These helpers do not retain cross-request state.
export const getBook = cache(async function getBook(id) {
  return request('book', id);
});
export const getAuthor = cache(async function getAuthor(id) {
  return request('author', id);
});
export const getStores = cache(async function getStores() {
  return request('stores');
});
export const getStock = cache(async function getStock(bookId, storeId) {
  return request('stock', bookId, storeId);
});
export const getReviews = cache(async function getReviews(bookId) {
  return request('reviews', bookId);
});
export const getReviewer = cache(async function getReviewer(id) {
  return request('reviewer', id);
});
