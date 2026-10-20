import {cache} from 'react';
import {request} from './backend.js';

export const readOrganization = cache(async function readOrganization(id) {
  return await request('organization', id);
});

export const readProjects = cache(async function readProjects(organizationId) {
  return await request('projects', organizationId);
});

export const readPerson = cache(async function readPerson(id) {
  if (id == null) return null;
  return await request('person', id);
});

export const readTaskSummary = cache(async function readTaskSummary(projectId) {
  const tasks = await request('tasks', projectId);
  const open = tasks.filter(task => task.state === 'open');
  return {total: tasks.length, completed: tasks.length - open.length, open};
});

export const readActivity = cache(async function readActivity(organizationId) {
  return await request('activity', organizationId);
});

export const readBilling = cache(async function readBilling(organizationId) {
  return await request('billing', organizationId);
});
