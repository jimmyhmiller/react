/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Deterministic data and state transitions shared by the board apps, which
// render the same project board (users, columns of cards, a details panel and
// "server pushed" notifications and presence) with different state libraries.

const FIRST_NAMES = [
  'Ada', 'Grace', 'Alan', 'Barbara', 'Donald', 'Edsger', 'Frances', 'Guido',
  'Hedy', 'John', 'Katherine', 'Linus', 'Margaret', 'Niklaus', 'Radia', 'Ken',
  'Shafi', 'Tim', 'Whitfield', 'Yukihiro',
];
const VERBS = [
  'Fix', 'Refactor', 'Design', 'Document', 'Profile', 'Migrate', 'Review',
  'Test', 'Ship', 'Remove',
];
const NOUNS = [
  'login flow', 'search index', 'billing page', 'cache layer', 'onboarding',
  'settings modal', 'API client', 'dark mode', 'export job', 'audit log',
  'rate limiter', 'image upload', 'mobile nav',
];
export const LABELS = ['bug', 'feature', 'design', 'infra', 'docs'];
export const COLUMN_TITLES = [
  'Backlog', 'Triage', 'Next', 'In progress', 'In review', 'QA', 'Staging',
  'Released', 'Blocked', 'Done',
];

export const CARD_COUNT = 1000;

function createRandom() {
  let seed = 7;
  return max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };
}

export function createBoardData() {
  const random = createRandom();
  const users = FIRST_NAMES.map((name, i) => ({
    id: 'u' + i,
    name,
    initials: name.slice(0, 2).toUpperCase(),
  }));
  const columns = COLUMN_TITLES.map((title, i) => ({id: 'c' + i, title}));
  const cards = [];
  for (let i = 0; i < CARD_COUNT; i++) {
    const labels = [];
    for (let j = 0; j < LABELS.length; j++) {
      if (random(4) === 0) {
        labels.push(LABELS[j]);
      }
    }
    cards.push({
      id: 'k' + i,
      title: `${VERBS[random(VERBS.length)]} ${NOUNS[random(NOUNS.length)]} #${i}`,
      columnId: columns[i % columns.length].id,
      assigneeId: users[random(users.length)].id,
      points: 1 + random(8),
      labels,
    });
  }
  return {users, columns, cards, currentUserId: 'u3'};
}

export function presenceAt(users, tick) {
  return users.filter((_, i) => (i + tick) % 3 === 0).map(user => user.id);
}

export function nextColumnId(columns, columnId) {
  const index = columns.findIndex(column => column.id === columnId);
  return columns[(index + 1) % columns.length].id;
}

export function cardMatches(card, filter, onlyMine, currentUserId) {
  if (onlyMine && card.assigneeId !== currentUserId) {
    return false;
  }
  return (
    filter === '' || card.title.toLowerCase().includes(filter.toLowerCase())
  );
}
