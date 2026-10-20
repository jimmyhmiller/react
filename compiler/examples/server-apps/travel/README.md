# Wander travel planner

A server-rendered itinerary with a daily schedule, place and host details,
weather, saved travelers, airport transport comparisons, and group activity totals.
The three fixture inputs cover a confirmed itinerary, a cancelled trip, and a
missing trip.

## Running

Use the server-app example runner to load the named `Page` export from `Page.jsx`
and pass each entry's `props` from `fixtures.json`. This directory requires React
with Server Component support and a JSX-capable server renderer; it does not
include a framework, client bundle, or standalone development server. The fixture
`expectedText` arrays describe text in the complete resolved render, not the
initial streaming shell. Decode HTML entities and join adjacent text nodes before
checking these strings.

## Design

`backend.js` exposes the only I/O boundary, `request(operation, ...primitiveArgs)`.
It returns detached JSON snapshots from deterministic in-memory fixtures with no
network calls or timers. Unknown records return null; unknown operations throw.
`data.js` wraps reads with React `cache`, sharing repeated trip, day, and activity
reads within a server render. Totals fetch days and activities concurrently using
ordinary promises. Leaf components own their place and weather reads, while the
page composes itinerary and sidebar sections. There are no writes or client
components.

Activity prices are per traveler. The group budget multiplies scheduled activity
prices by saved traveler count and excludes lodging and optional transport.
Cancelled trips retain the host and travelers but have no scheduled activities.
Forecasts, dates, and prices are illustrative fixtures, not live travel advice.
