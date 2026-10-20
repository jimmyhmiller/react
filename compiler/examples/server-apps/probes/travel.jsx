import React from 'react';
import {Page as OriginalPage} from '../travel/Page.jsx';
import {
  getTrip,
  getDay,
  getActivity,
  getPlace,
  getHost,
  getTraveler,
  getWeather,
  getTransport,
} from '../travel/data.js';

async function warm({tripId = 'porto-weekend'}) {
  const trip = await getTrip(tripId);
  if (!trip) return;
  const active = trip.status !== 'cancelled';
  await Promise.all([
    getHost(trip.hostId),
    ...trip.travelerIds.map(id => getTraveler(id)),
    ...(active ? [getTransport(trip.id)] : []),
    ...trip.dayIds.map(async id => {
      const day = await getDay(id);
      if (!day) return;
      await Promise.all([
        ...(active ? [getWeather(day.weatherId)] : []),
        ...day.activityIds.map(async activityId => {
          const activity = await getActivity(activityId);
          if (active && activity) await getPlace(activity.placeId);
        }),
      ]);
    }),
  ]);
}

export function Page(props) {
  warm(props).catch(() => {});
  return <OriginalPage {...props} />;
}
