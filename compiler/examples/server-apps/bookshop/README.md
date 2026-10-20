# Leaf & Lantern bookshop

A small React Server Components storefront. `Page.jsx` exports the async `Page`
component; pass `{bookId: 'tidal-atlas'}` or use the default. The sibling
`fixtures.json` contains props and expected visible text for available, sold-out,
and missing-book renders.

Run this through a React Server Components renderer with JSX transformation and
React's server export condition. There is no standalone HTTP server, package
installation, framework, client component, or network dependency in this example.
A runner should render `Page` with each fixture's `props`, finish the complete
server render (including async descendants), and check every `expectedText`
substring against normalized visible text. A conventional synchronous DOM server
renderer does not support these async server components.

`backend.js` is the sole I/O boundary: `request(operation, ...primitiveArgs)`
returns deterministic cloned JSON. `data.js` wraps each read in React `cache` so
components can share reads within an RSC request. Book details gate the page;
author, availability, reviews, and related titles compose independently. Store
stock reads fan out with `Promise.all`, while each review loads its reader and
each related title loads its author. All reads are read-only. Missing books,
missing author/reviewer records, missing stock records, zero stock, and empty
reviews have explicit UI states.
