import {readOrganization, readProjects, readPerson, readTaskSummary, readActivity, readBilling} from './data.js';

const panel = {background: '#fff', border: '1px solid #e5e5de', borderRadius: 16, padding: 24};
const muted = {color: '#68716b', fontSize: 14};

function Avatar({person}) {
  return <span aria-hidden="true" style={{display: 'inline-grid', placeItems: 'center', width: 38, height: 38, borderRadius: '50%', background: person?.color ?? '#eceee9', fontSize: 12, fontWeight: 700, flexShrink: 0}}>{person?.initials ?? '?'}</span>;
}

async function Owner({id}) {
  const person = await readPerson(id);
  return <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 22}}><Avatar person={person}/><div><div style={{fontSize: 14, fontWeight: 600}}>{person?.name ?? 'Owner needed'}</div><div style={muted}>{person?.role ?? 'Assign someone to guide this project'}</div></div></div>;
}

async function ProjectCard({project}) {
  const summary = await readTaskSummary(project.id);
  return <article style={panel}>
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8}}><span style={{background: project.color, borderRadius: 10, padding: '8px 12px', fontWeight: 700}} aria-hidden="true">{project.name.slice(0, 1)}</span><span style={{...muted, color: project.status === 'Needs attention' ? '#9a511d' : '#476a54'}}>{project.status}</span></div>
    <h3 style={{marginBottom: 8}}>{project.name}</h3><p style={{...muted, lineHeight: 1.6, minHeight: 44}}>{project.description}</p>
    <Owner id={project.ownerId}/>
    <div style={{borderTop: '1px solid #eceee9', marginTop: 22, paddingTop: 18}}><strong>{summary.open.length} open {summary.open.length === 1 ? 'task' : 'tasks'}</strong><span style={{...muted, display: 'block', marginTop: 6}}>{summary.completed} of {summary.total} completed</span>
      {summary.open.length ? <ul style={{paddingLeft: 18, ...muted, lineHeight: 1.8}}>{summary.open.map(task => <li key={task.id}>{task.title}</li>)}</ul> : <p style={muted}>No open tasks. Room to think.</p>}
      <p style={{...muted, marginBottom: 0}}>{project.due ? `Next milestone · ${project.due}` : 'No milestone scheduled'}</p>
    </div>
  </article>;
}

async function ActivityItem({item}) {
  const actor = await readPerson(item.actorId);
  return <li style={{display: 'flex', gap: 12, padding: '16px 0', borderBottom: '1px solid #eceee9'}}><Avatar person={actor}/><div><div style={{fontSize: 14, lineHeight: 1.6}}><strong>{actor?.name ?? 'Former teammate'}</strong>{' '}{item.action}</div><div style={muted}>{item.time}</div></div></li>;
}

async function Activity({organizationId}) {
  const items = await readActivity(organizationId);
  return <section style={panel}><h2 style={{fontSize: 20, marginTop: 0}}>Around the studio</h2>{items.length ? <ul style={{listStyle: 'none', padding: 0, marginBottom: 0}}>{items.map(item => <ActivityItem key={item.id} item={item}/>)}</ul> : <p style={muted}>Nothing here yet. Your team's next steps will appear here.</p>}</section>;
}

async function Billing({organizationId}) {
  const billing = await readBilling(organizationId);
  if (!billing) return null;
  return <aside style={{...panel, background: '#eaf0e8'}}><p style={{...muted, marginTop: 0}}>YOUR WORKSPACE</p><h2 style={{fontSize: 22}}>{billing.plan} plan</h2><p>{billing.seats} of {billing.seatLimit} seats in use</p><progress aria-label="Workspace seats used" value={billing.seats} max={billing.seatLimit} style={{width: '100%', accentColor: '#476a54'}}/><p style={muted}>Renews {billing.renewal}</p></aside>;
}

export async function Page({organizationId = 'northstar', showBilling = false}) {
  const organization = await readOrganization(organizationId);
  if (!organization) return <main style={{...panel, fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '80px auto'}}><p style={muted}>WORKSPACE UNAVAILABLE</p><h1>We couldn't find that studio</h1><p>Check the organization address and try again.</p></main>;
  const projects = await readProjects(organization.id);
  const summaries = await Promise.all(projects.map(project => readTaskSummary(project.id)));
  const openCount = summaries.reduce((count, summary) => count + summary.open.length, 0);
  return <main style={{fontFamily: 'system-ui, sans-serif', color: '#26342b', background: '#f5f6f0', padding: '40px 32px', maxWidth: 1160, margin: '0 auto'}}>
    <header style={{borderBottom: '1px solid #ddded6', paddingBottom: 30, marginBottom: 30}}><p style={{...muted, letterSpacing: 2, fontSize: 11, fontWeight: 700}}>STUDIO / OVERVIEW</p><h1 style={{fontSize: 36, letterSpacing: -1, marginBottom: 10}}>{organization.name}</h1><p style={muted}>{organization.description}</p><div style={{display: 'flex', gap: 32, marginTop: 26}}><div><strong style={{fontSize: 24}}>{projects.length}</strong><span style={{...muted, marginLeft: 8}}>projects</span></div><div><strong style={{fontSize: 24}}>{openCount}</strong><span style={{...muted, marginLeft: 8}}>open tasks</span></div></div></header>
    <section aria-labelledby="projects-heading"><h2 id="projects-heading" style={{fontSize: 20}}>Work in motion</h2>{projects.length ? <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 18}}>{projects.map(project => <ProjectCard key={project.id} project={project}/>)}</div> : <div style={{...panel, padding: 40}}><h3>Your first project starts here</h3><p style={muted}>Gather a team, choose a direction, and make space for the work.</p></div>}</section>
    <div style={{display: 'grid', gridTemplateColumns: showBilling ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 18, marginTop: 28}}><Activity organizationId={organization.id}/>{showBilling ? <Billing organizationId={organization.id}/> : null}</div>
    <footer style={{...muted, fontSize: 12, marginTop: 28}}>A little clarity for the work ahead.</footer>
  </main>;
}
