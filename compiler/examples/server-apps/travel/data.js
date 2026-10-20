import {cache} from 'react';
import {request} from './backend.js';

export const getTrip = cache(async function getTrip(id) { return request('trip', id); });
export const getDay = cache(async function getDay(id) { return request('day', id); });
export const getActivity = cache(async function getActivity(id) { return request('activity', id); });
export const getPlace = cache(async function getPlace(id) { return request('place', id); });
export const getHost = cache(async function getHost(id) { return request('host', id); });
export const getTraveler = cache(async function getTraveler(id) { return request('traveler', id); });
export const getWeather = cache(async function getWeather(id) { return request('weather', id); });
export const getTransport = cache(async function getTransport(tripId) { return request('transport', tripId); });

export const getTripTotals = cache(async function getTripTotals(tripId) {
  const trip = await getTrip(tripId);
  if (!trip) return null;
  const days = await Promise.all(trip.dayIds.map(id => getDay(id)));
  const activities = (await Promise.all(days.filter(Boolean).flatMap(day => day.activityIds).map(id => getActivity(id)))).filter(Boolean);
  return {
    travelers: trip.travelerIds.length,
    days: days.filter(Boolean).length,
    activities: activities.length,
    minutes: activities.reduce((sum, activity) => sum + activity.durationMinutes, 0),
    activityCost: activities.reduce((sum, activity) => sum + activity.pricePerTraveler, 0) * trip.travelerIds.length,
  };
});
