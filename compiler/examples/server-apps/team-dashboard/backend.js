const organizations = {
  northstar: {id: 'northstar', name: 'Northstar Studio', description: 'Thoughtful tools for teams doing their best work.', plan: 'Studio', seats: 8, seatLimit: 12, renewal: 'November 1, 2026'},
  seedling: {id: 'seedling', name: 'Seedling Lab', description: 'A fresh space for your next good idea.', plan: 'Starter', seats: 1, seatLimit: 3, renewal: 'November 8, 2026'},
};

const people = {
  maya: {id: 'maya', name: 'Maya Chen', role: 'Product design', initials: 'MC', color: '#e5d9fb'},
  jonah: {id: 'jonah', name: 'Jonah Reed', role: 'Engineering', initials: 'JR', color: '#d3eee1'},
  ellis: {id: 'ellis', name: 'Ellis Park', role: 'Research', initials: 'EP', color: '#ffe2c4'},
};

const projects = {
  northstar: [
    {id: 'atlas', name: 'Atlas workspace', description: 'Give every team a calmer place to plan.', ownerId: 'maya', status: 'On track', due: 'October 30', color: '#e5d9fb'},
    {id: 'beacon', name: 'Beacon launch', description: 'Bring our next chapter into the world.', ownerId: 'jonah', status: 'Needs attention', due: 'November 6', color: '#d3eee1'},
    {id: 'fieldnotes', name: 'Field notes', description: 'Turn customer conversations into clearer decisions.', ownerId: null, status: 'Planning', due: null, color: '#ffe2c4'},
  ],
  seedling: [],
};

const tasks = {
  atlas: [
    {id: 'a1', title: 'Review navigation prototype', state: 'open'},
    {id: 'a2', title: 'Write onboarding copy', state: 'open'},
    {id: 'a3', title: 'Map workspace permissions', state: 'done'},
  ],
  beacon: [
    {id: 'b1', title: 'Confirm launch checklist', state: 'open'},
    {id: 'b2', title: 'Prepare customer preview', state: 'open'},
    {id: 'b3', title: 'Resolve accessibility review', state: 'open'},
  ],
  fieldnotes: [],
};

const activities = {
  northstar: [
    {id: 'event1', actorId: 'maya', action: 'shared a new prototype for Atlas workspace', time: '12 minutes ago'},
    {id: 'event2', actorId: 'ellis', action: 'added three interviews to Field notes', time: '48 minutes ago'},
    {id: 'event3', actorId: 'former-member', action: 'updated the Beacon launch brief', time: '2 hours ago'},
  ],
  seedling: [],
};

// A deterministic, read-only stand-in for a service. Every response is plain JSON.
export async function request(operation, ...args) {
  let result;
  switch (operation) {
    case 'organization': result = organizations[args[0]] ?? null; break;
    case 'projects': result = projects[args[0]] ?? []; break;
    case 'person': result = people[args[0]] ?? null; break;
    case 'tasks': result = tasks[args[0]] ?? []; break;
    case 'activity': result = activities[args[0]] ?? []; break;
    case 'billing': {
      const organization = organizations[args[0]];
      result = organization ? {plan: organization.plan, seats: organization.seats, seatLimit: organization.seatLimit, renewal: organization.renewal} : null;
      break;
    }
    default: throw new Error(`Unknown operation: ${operation}`);
  }
  return JSON.parse(JSON.stringify(result));
}
