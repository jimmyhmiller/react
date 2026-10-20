import React from 'react';
import {Page as OriginalPage} from '../team-dashboard/Page.jsx';
import {
  readOrganization,
  readProjects,
  readPerson,
  readTaskSummary,
  readActivity,
  readBilling,
} from '../team-dashboard/data.js';

async function warm({organizationId = 'northstar', showBilling = false}) {
  const organization = await readOrganization(organizationId);
  if (!organization) return;
  await Promise.all([
    readProjects(organization.id).then(projects =>
      Promise.all(
        projects.flatMap(project => [
          readTaskSummary(project.id),
          readPerson(project.ownerId),
        ])
      )
    ),
    readActivity(organization.id).then(items =>
      Promise.all(items.map(item => readPerson(item.actorId)))
    ),
    ...(showBilling ? [readBilling(organization.id)] : []),
  ]);
}

export function Page(props) {
  warm(props).catch(() => {});
  return <OriginalPage {...props} />;
}
