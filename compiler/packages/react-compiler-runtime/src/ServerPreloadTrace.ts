/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type {PreloadEvent} from './ServerPreloadScheduler';

export type ServerPreloadTrace = {
  version: 1;
  events: Array<PreloadEvent>;
  droppedEvents: number;
};

/** Bounded, request-local recording. Keys and returned values are never recorded. */
export function createServerPreloadTrace(options: {maxEvents?: number} = {}): {
  onEvent: (event: PreloadEvent) => void;
  snapshot: () => ServerPreloadTrace;
} {
  const limit = options.maxEvents ?? 10000;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error('maxEvents must be a nonnegative safe integer');
  }
  const events: Array<PreloadEvent> = [];
  let droppedEvents = 0;
  return {
    onEvent(event): void {
      if (events.length >= limit) {
        droppedEvents++;
        return;
      }
      events.push({...event, criticalPath: [...event.criticalPath]});
    },
    snapshot(): ServerPreloadTrace {
      return {
        version: 1,
        events: events.map(event => ({
          ...event,
          criticalPath: [...event.criticalPath],
        })),
        droppedEvents,
      };
    },
  };
}
