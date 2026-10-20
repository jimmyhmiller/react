import React from 'react';
import {getTrip, getDay, getActivity, getPlace, getHost, getTraveler, getWeather, getTransport, getTripTotals} from './data.js';

const card = {background: '#fff', border: '1px solid #deded5', borderRadius: 16, padding: 24, marginBottom: 20};
const muted = {color: '#58615c'};
function money(amount) { return `€${amount}`; }

async function Place({id}) {
  const place = await getPlace(id);
  if (!place) return <p>Place details unavailable.</p>;
  return <div style={muted}><strong>{place.name}</strong><p>{place.neighborhood} · {place.address}</p><p>{place.detail}</p></div>;
}

async function Activity({id}) {
  const activity = await getActivity(id);
  if (!activity) return <li>Activity unavailable.</li>;
  return <li style={{padding: '20px 0', borderTop: '1px solid #ecece5'}}>
    <p style={{color: '#8a4b30'}}>{activity.time} · {activity.durationMinutes} minutes · {activity.pricePerTraveler === 0 ? 'Free' : `${money(activity.pricePerTraveler)} per traveler`}</p>
    <h3>{activity.title}</h3>
    <Place id={activity.placeId} />
    <p>{activity.note}</p>
  </li>;
}

async function Weather({id}) {
  const weather = await getWeather(id);
  if (!weather) return <p>Forecast unavailable.</p>;
  return <aside aria-label="Daily weather" style={{background: '#eef3ec', borderRadius: 10, padding: '12px 16px'}}>
    <strong>{weather.summary}</strong><p>{weather.low}–{weather.high}°C · {weather.advice}</p>
  </aside>;
}

async function Day({id, number}) {
  const day = await getDay(id);
  if (!day) return <section style={card}><h2>Day {number}</h2><p>Day details unavailable.</p></section>;
  return <section style={card}>
    <p style={muted}>Day {number} · {day.label}</p><h2>{day.theme}</h2>
    <Weather id={day.weatherId} />
    <ol style={{listStyle: 'none', padding: 0, marginBottom: 0}}>{day.activityIds.map(activityId => <Activity key={activityId} id={activityId} />)}</ol>
  </section>;
}

async function Host({id}) {
  const host = await getHost(id);
  if (!host) return <section style={card}><h2>Your local host</h2><p>Host details unavailable.</p></section>;
  return <section style={card}><p style={muted}>{host.role}</p><h2>{host.name}</h2><p>{host.languages}</p><blockquote style={{margin: 0}}>{host.tip}</blockquote></section>;
}

async function Travelers({ids}) {
  const travelers = await Promise.all(ids.map(id => getTraveler(id)));
  return <section style={card}><h2>Saved travelers</h2><ul style={{paddingLeft: 20}}>{travelers.map((traveler, index) => <li key={ids[index]} style={{marginBottom: 14}}>{traveler ? <><strong>{traveler.name}</strong><p style={muted}>{traveler.preference}</p></> : 'Traveler unavailable.'}</li>)}</ul></section>;
}

async function Totals({tripId}) {
  const totals = await getTripTotals(tripId);
  if (!totals) return null;
  return <section style={card}><h2>At a glance</h2><dl>
    <dt>Travelers</dt><dd>{totals.travelers} saved {totals.travelers === 1 ? 'traveler' : 'travelers'}</dd>
    <dt>Itinerary</dt><dd>{totals.days} planned days · {totals.activities} activities</dd>
    <dt>Activity time</dt><dd>{totals.minutes} minutes planned</dd>
    <dt>Activity budget</dt><dd>{money(totals.activityCost)} for the group</dd>
  </dl><p style={muted}>Activity prices only. Accommodation and transport are separate.</p></section>;
}

async function Transport({tripId, travelerCount}) {
  const options = await getTransport(tripId);
  return <section style={card}><h2>Getting there</h2>{options?.length ? <ul style={{paddingLeft: 20}}>{options.map(option => <li key={option.id}><h3>{option.name}</h3><p>{option.detail}</p><p>{option.groupPrice != null ? `${money(option.groupPrice)} for the group` : `${money(option.pricePerTraveler)} per traveler · ${money(option.pricePerTraveler * travelerCount)} for the group`}</p></li>)}</ul> : <p>No transport options saved.</p>}</section>;
}

export async function Page({tripId = 'porto-weekend'}) {
  const trip = await getTrip(tripId);
  if (!trip) return <main style={{...card, maxWidth: 700, margin: '48px auto', fontFamily: 'system-ui'}}><p>WANDER / YOUR TRIPS</p><h1>Trip not found</h1><p>We could not find a saved itinerary for this trip.</p><p>Try Porto weekend or Alpine escape from your saved trips.</p></main>;
  return <main style={{background: '#f5f4ed', color: '#253c32', fontFamily: 'system-ui, sans-serif', padding: '40px 24px', maxWidth: 1120, margin: '0 auto', lineHeight: 1.55}}>
    <header style={{padding: '12px 0 28px'}}><p style={{letterSpacing: 3, fontSize: 12}}>WANDER / YOUR TRIPS</p><p>{trip.destination} · {trip.dates}</p><h1 style={{fontSize: 44, lineHeight: 1.12, maxWidth: 640}}>{trip.title}</h1><p>{trip.description}</p><strong>{trip.status === 'cancelled' ? 'Cancelled trip' : 'Ready to explore'}</strong></header>
    {trip.status === 'cancelled' ? <section style={card}><h2>Your plans are on pause</h2><p>Activities and transport are no longer scheduled. Your saved travelers and host details are kept below.</p></section> : null}
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24}}>
      <div>{trip.status !== 'cancelled' ? trip.dayIds.map((id, index) => <Day key={id} id={id} number={index + 1} />) : null}<Host id={trip.hostId} /></div>
      <div><Totals tripId={trip.id} /><Travelers ids={trip.travelerIds} />{trip.status !== 'cancelled' ? <Transport tripId={trip.id} travelerCount={trip.travelerIds.length} /> : null}</div>
    </div>
    <footer style={muted}>Made for unhurried days. All times are local.</footer>
  </main>;
}
