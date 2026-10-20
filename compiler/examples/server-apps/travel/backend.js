const trips = {
  'porto-weekend': {
    id: 'porto-weekend', title: 'A slow weekend in Porto', destination: 'Porto, Portugal',
    dates: 'May 16–18, 2027', status: 'confirmed', currency: 'EUR',
    description: 'River walks, neighborhood kitchens, and time to get a little lost.',
    hostId: 'ines', travelerIds: ['maya', 'leo'], dayIds: ['sunday', 'monday'],
  },
  'alpine-escape': {
    id: 'alpine-escape', title: 'Alpine escape', destination: 'Chamonix, France',
    dates: 'June 4–6, 2027', status: 'cancelled', currency: 'EUR',
    description: 'This trip was cancelled because the mountain lodge is closed.',
    hostId: 'camille', travelerIds: ['maya'], dayIds: [],
  },
};
const days = {
  sunday: {id: 'sunday', label: 'Sunday, May 16', theme: 'Settle into the riverside', activityIds: ['check-in', 'river-walk'], weatherId: 'porto-sunday'},
  monday: {id: 'monday', label: 'Monday, May 17', theme: 'Taste your way uphill', activityIds: ['market', 'garden'], weatherId: 'porto-monday'},
};
const activities = {
  'check-in': {id: 'check-in', time: '14:00', title: 'Check in at Casa Clara', placeId: 'casa', durationMinutes: 45, pricePerTraveler: 0, note: 'Leave your bags and pick up the neighborhood map.'},
  'river-walk': {id: 'river-walk', time: '16:00', title: 'Ribeira photo walk', placeId: 'ribeira', durationMinutes: 90, pricePerTraveler: 12, note: 'Meet beside the fountain; comfortable shoes recommended.'},
  market: {id: 'market', time: '10:00', title: 'Bolhão tasting tour', placeId: 'bolhao', durationMinutes: 120, pricePerTraveler: 38, note: 'Includes coffee, pastries, and a seasonal lunch.'},
  garden: {id: 'garden', time: '15:30', title: 'An afternoon in the gardens', placeId: 'gardens', durationMinutes: 60, pricePerTraveler: 0, note: 'Bring a book. There is no reservation to rush for.'},
};
const places = {
  casa: {id: 'casa', name: 'Casa Clara', neighborhood: 'Miragaia', address: 'Rua de Miragaia 42', detail: 'A small guesthouse with a sunny shared terrace.'},
  ribeira: {id: 'ribeira', name: 'Praça da Ribeira', neighborhood: 'Ribeira', address: 'Praça da Ribeira', detail: 'Colorful riverfront lanes overlooking the Douro.'},
  bolhao: {id: 'bolhao', name: 'Mercado do Bolhão', neighborhood: 'Bolhão', address: 'Rua Formosa 322', detail: 'A restored market filled with independent food stalls.'},
  gardens: {id: 'gardens', name: 'Jardins do Palácio de Cristal', neighborhood: 'Massarelos', address: 'Rua de Dom Manuel II', detail: 'Shaded paths, peacocks, and wide river views.'},
};
const hosts = {
  ines: {id: 'ines', name: 'Inês Ferreira', role: 'Your local host', languages: 'Portuguese and English', tip: 'Take the tram early, then walk back along the river.'},
  camille: {id: 'camille', name: 'Camille Laurent', role: 'Your local host', languages: 'French and English', tip: 'Save the mountain trails for a clear morning.'},
};
const travelers = {
  maya: {id: 'maya', name: 'Maya Chen', preference: 'Vegetarian · loves architecture'},
  leo: {id: 'leo', name: 'Leo Martins', preference: 'Coffee stops · light walking pace'},
};
const weather = {
  'porto-sunday': {summary: 'Sunny intervals', low: 14, high: 22, advice: 'Pack a light layer for the river breeze.'},
  'porto-monday': {summary: 'Light afternoon showers', low: 15, high: 20, advice: 'A small umbrella will come in handy.'},
};
const transport = {
  'porto-weekend': [
    {id: 'metro', name: 'Airport metro', detail: 'Line E to Trindade · about 30 minutes', pricePerTraveler: 3},
    {id: 'taxi', name: 'Shared taxi', detail: 'Airport to Casa Clara · about 25 minutes', groupPrice: 28},
  ],
  'alpine-escape': [],
};

// The single I/O boundary. Each response is a detached, JSON-compatible snapshot.
export async function request(operation, ...args) {
  if (args.some(value => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) {
    throw new TypeError('Request arguments must be primitives.');
  }
  const tables = {trip: trips, day: days, activity: activities, place: places, host: hosts, traveler: travelers, weather, transport};
  if (!Object.prototype.hasOwnProperty.call(tables, operation)) {
    throw new Error(`Unknown travel operation: ${operation}`);
  }
  const value = tables[operation][args[0]] ?? null;
  return JSON.parse(JSON.stringify(value));
}
