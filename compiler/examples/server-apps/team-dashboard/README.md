# Team dashboard

A framework-independent React Server Components example. `Page.jsx` exports the async `Page` component; pass one of the props objects in `fixtures.json` to an RSC-capable renderer and check the resolved output for its `expectedText` entries. It requires React with `cache` support and a JSX/RSC build environment; a synchronous client renderer cannot execute these server components. There is no standalone development server or additional dependency.

The page loads its organization, project list, and task summaries with ordinary async/await. Project cards, owner details, activity rows, and the optional billing panel compose independent async server components. Request-scoped cached readers share task summaries between the overview and cards, and share people between project owners and activity actors. `backend.js` is the sole I/O boundary: its async `request(operation, ...primitiveArgs)` returns fresh deterministic JSON data without timers, network access, or writes.

Fixtures cover a populated studio with billing, an empty studio without billing, and a missing organization. A project without an owner or tasks and an activity from a former teammate exercise smaller missing-data states. All dates and relative activity labels are fixture text, so rendering is independent of the current clock.
