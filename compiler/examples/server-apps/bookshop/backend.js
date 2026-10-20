const books = {
  'tidal-atlas': {
    id: 'tidal-atlas', title: 'The Tidal Atlas', authorId: 'mara-vale',
    description: 'A cartographer returns to the coast to map the places the sea has taken.',
    price: 24, format: 'Hardcover', category: 'Fiction', relatedIds: ['field-notes', 'winter-orchard'],
  },
  'field-notes': {
    id: 'field-notes', title: 'Field Notes for a Quiet World', authorId: 'eli-park',
    description: 'Small observations from a year spent walking the same woodland path.',
    price: 18, format: 'Paperback', category: 'Nature', relatedIds: ['tidal-atlas'],
  },
  'winter-orchard': {
    id: 'winter-orchard', title: 'The Winter Orchard', authorId: 'mara-vale',
    description: 'Three sisters find a new season in the orchard they inherit.',
    price: 16, format: 'Paperback', category: 'Fiction', relatedIds: ['tidal-atlas'],
  },
};
const authors = {
  'mara-vale': {id: 'mara-vale', name: 'Mara Vale', bio: 'Mara writes novels about coastal communities and the stories carried between generations.', hometown: 'Port Townsend, Washington'},
  'eli-park': {id: 'eli-park', name: 'Eli Park', bio: 'Eli is an essayist and field naturalist who writes about paying attention to everyday landscapes.', hometown: 'Asheville, North Carolina'},
};
const stores = [
  {id: 'harbor', name: 'Harbor Books', address: '18 Water Street'},
  {id: 'maple', name: 'Maple Street Books', address: '42 Maple Street'},
  {id: 'station', name: 'Station Bookroom', address: '7 Railway Square'},
];
const stock = {
  'tidal-atlas': {harbor: 6, maple: 0, station: 2},
  'field-notes': {harbor: 0, maple: 0, station: 0},
  'winter-orchard': {harbor: 1, maple: 3, station: 0},
};
const reviews = {
  'tidal-atlas': [
    {id: 'r1', reviewerId: 'nora', rating: 5, title: 'A coastline you can feel', body: 'Beautifully observed, with characters who stayed with me long after the last page.'},
    {id: 'r2', reviewerId: 'sam', rating: 4, title: 'Worth slowing down for', body: 'A patient, thoughtful novel. The maps and family history fit together wonderfully.'},
  ],
  'field-notes': [],
  'winter-orchard': [],
};
const reviewers = {
  nora: {id: 'nora', name: 'Nora Chen', location: 'Seattle, WA', reviewCount: 12},
  sam: {id: 'sam', name: 'Sam Rivera', location: 'Portland, OR', reviewCount: 8},
};

// This is the single replaceable I/O boundary. Return independent plain JSON
// values so callers cannot mutate fixture state or share mutable backend records.
export async function request(operation, ...primitiveArgs) {
  if (primitiveArgs.some(arg => arg !== null && !['string', 'number', 'boolean'].includes(typeof arg))) {
    throw new TypeError('Backend arguments must be JSON primitives.');
  }
  const [id, storeId] = primitiveArgs;
  let result;
  switch (operation) {
    case 'book': result = Object.hasOwn(books, id) ? books[id] : null; break;
    case 'author': result = Object.hasOwn(authors, id) ? authors[id] : null; break;
    case 'stores': result = stores; break;
    case 'stock': result = Object.hasOwn(stock, id) && Object.hasOwn(stock[id], storeId) ? {quantity: stock[id][storeId]} : null; break;
    case 'reviews': result = Object.hasOwn(reviews, id) ? reviews[id] : []; break;
    case 'reviewer': result = Object.hasOwn(reviewers, id) ? reviewers[id] : null; break;
    default: throw new Error(`Unknown bookshop operation: ${operation}`);
  }
  return JSON.parse(JSON.stringify(result));
}
