/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {
  Instance,
  TextInstance,
  ActivityInstance,
  SuspenseInstance,
  Container,
  ChildSet,
  FragmentInstanceType,
} from './ReactFiberConfig';
import type {Fiber, FiberRoot} from './ReactInternalTypes';

import {
  HostRoot,
  HostComponent,
  HostHoistable,
  HostSingleton,
  HostText,
  HostPortal,
  DehydratedFragment,
  HostBlock,
  HostBlockSlot,
} from './ReactWorkTags';
import {ContentReset, Placement} from './ReactFiberFlags';
import {
  supportsMutation,
  supportsResources,
  supportsSingletons,
  commitMount,
  commitUpdate,
  resetTextContent,
  commitTextUpdate,
  appendChild,
  appendChildToContainer,
  insertBefore,
  insertInContainerBefore,
  replaceContainerChildren,
  hideDehydratedBoundary,
  hideInstance,
  getBlockRootHostProps,
  hideTextInstance,
  unhideDehydratedBoundary,
  unhideInstance,
  unhideTextInstance,
  commitHydratedInstance,
  commitHydratedContainer,
  commitHydratedActivityInstance,
  commitHydratedSuspenseInstance,
  removeChildFromContainer,
  removeChild,
  acquireSingletonInstance,
  releaseSingletonInstance,
  isSingletonScope,
  commitBlockUpdate,
  getBlockSlotParent,
  getBlockSlotPosition,
  getBlockSlotNextStaticSibling,
  getBlockSlotCount,
  getBlockSlotValue,
  blockSlotNeedsCommit,
  getBlockSlotInlineNode,
  setBlockSlotContent,
  adoptBlockInlineItem,
  getBlockValues,
} from './ReactFiberConfig';
import {captureCommitPhaseError} from './ReactFiberWorkLoop';
import {getBlockSlotFiberItems} from './ReactFiberBlockSlots';
import {trackHostMutation} from './ReactFiberMutationTracking';

import {runWithFiberInDEV} from './ReactCurrentFiber';
import {enableFragmentRefs} from 'shared/ReactFeatureFlags';
import {
  commitNewChildToFragmentInstances,
  getParentFragmentInstances,
} from './ReactFiberFragmentInstance';

export function commitHostMount(finishedWork: Fiber) {
  const type = finishedWork.type;
  const props = finishedWork.memoizedProps;
  const instance: Instance = finishedWork.stateNode;
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitMount,
        instance,
        type,
        props,
        finishedWork,
      );
    } else {
      commitMount(instance, type, props, finishedWork);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostHydratedInstance(finishedWork: Fiber) {
  const type = finishedWork.type;
  const props = finishedWork.memoizedProps;
  const instance: Instance = finishedWork.stateNode;
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitHydratedInstance,
        instance,
        type,
        props,
        finishedWork,
      );
    } else {
      commitHydratedInstance(instance, type, props, finishedWork);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostUpdate(
  finishedWork: Fiber,
  newProps: any,
  oldProps: any,
): void {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitUpdate,
        finishedWork.stateNode,
        finishedWork.type,
        oldProps,
        newProps,
        finishedWork,
      );
    } else {
      commitUpdate(
        finishedWork.stateNode,
        finishedWork.type,
        oldProps,
        newProps,
        finishedWork,
      );
    }
    // Mutations are tracked manually from within commitUpdate.
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostBlockUpdate(
  finishedWork: Fiber,
  newProps: any,
  oldValues: any,
): void {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitBlockUpdateImpl,
        finishedWork,
        oldValues,
        newProps.v,
      );
    } else {
      commitBlockUpdateImpl(finishedWork, oldValues, newProps.v);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

// A new block fiber that adopted the instance of an inline list item (see
// updateHostBlock) takes the instance over. Returns the item's committed
// values, which the block's values are then applied over.
export function commitHostBlockAdoption(
  finishedWork: Fiber,
): $ReadOnlyArray<mixed> {
  const item = finishedWork.memoizedState;
  finishedWork.memoizedState = null;
  adoptBlockInlineItem(item, finishedWork);
  return getBlockValues(finishedWork.stateNode);
}

function commitBlockUpdateImpl(
  finishedWork: Fiber,
  oldValues: $ReadOnlyArray<mixed>,
  newValues: $ReadOnlyArray<mixed>,
): void {
  const block: Instance = finishedWork.stateNode;
  const template = finishedWork.type;
  commitBlockUpdate(block, template, oldValues, newValues);
  // Inline slot content. Deletions and placements of slot fibers have already
  // been committed. Slots are updated in template order so that new content is
  // inserted relative to the final nodes of earlier slots.
  const slotCount = getBlockSlotCount(template);
  let slotFiber = finishedWork.child;
  for (let i = 0; i < slotCount; i++) {
    const currentSlotFiber = slotFiber;
    const hasFiber = slotFiber !== null && slotFiber.index === i;
    if (hasFiber) {
      slotFiber = (slotFiber as any).sibling;
    }
    const oldValue = getBlockSlotValue(template, oldValues, i);
    const newValue = getBlockSlotValue(template, newValues, i);
    if (!blockSlotNeedsCommit(oldValue, newValue)) {
      continue;
    }
    if (hasFiber && (currentSlotFiber as any).memoizedProps.list === null) {
      // The slot now renders through its fiber; remove any inline content.
      setBlockSlotContent(block, i, null, null, null, null);
    } else {
      // Inline content, or a list whose items with fibers are the slot
      // fiber's children.
      setBlockSlotContent(
        block,
        i,
        newValue,
        oldValue,
        getBlockSlotInsertionPoint(finishedWork, i, true),
        hasFiber
          ? getBlockSlotFiberItems(
              currentSlotFiber as any,
              (newValue as any).length,
            )
          : null,
      );
    }
  }
}

export function commitHostTextUpdate(
  finishedWork: Fiber,
  newText: string,
  oldText: string,
) {
  const textInstance: TextInstance = finishedWork.stateNode;
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitTextUpdate,
        textInstance,
        oldText,
        newText,
      );
    } else {
      commitTextUpdate(textInstance, oldText, newText);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostResetTextContent(finishedWork: Fiber) {
  const instance: Instance = finishedWork.stateNode;
  try {
    if (__DEV__) {
      runWithFiberInDEV(finishedWork, resetTextContent, instance);
    } else {
      resetTextContent(instance);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitShowHideSuspenseBoundary(node: Fiber, isHidden: boolean) {
  try {
    const instance = node.stateNode;
    if (isHidden) {
      if (__DEV__) {
        runWithFiberInDEV(node, hideDehydratedBoundary, instance);
      } else {
        hideDehydratedBoundary(instance);
      }
    } else {
      if (__DEV__) {
        runWithFiberInDEV(node, unhideDehydratedBoundary, node.stateNode);
      } else {
        unhideDehydratedBoundary(node.stateNode);
      }
    }
  } catch (error) {
    captureCommitPhaseError(node, node.return, error);
  }
}

// The props of a host instance that the commit phase reads after it was
// rendered: a block's root element has no props of its own.
export function getHostInstanceProps(fiber: Fiber): any {
  return fiber.tag === HostBlock
    ? getBlockRootHostProps(fiber.type, fiber.memoizedProps.v)
    : fiber.memoizedProps;
}

export function commitShowHideHostInstance(node: Fiber, isHidden: boolean) {
  try {
    const instance = node.stateNode;
    if (isHidden) {
      if (__DEV__) {
        runWithFiberInDEV(node, hideInstance, instance);
      } else {
        hideInstance(instance);
      }
    } else {
      const props = getHostInstanceProps(node);
      if (__DEV__) {
        runWithFiberInDEV(node, unhideInstance, node.stateNode, props);
      } else {
        unhideInstance(node.stateNode, props);
      }
    }
  } catch (error) {
    captureCommitPhaseError(node, node.return, error);
  }
}

export function commitShowHideHostTextInstance(node: Fiber, isHidden: boolean) {
  try {
    const instance = node.stateNode;
    if (isHidden) {
      if (__DEV__) {
        runWithFiberInDEV(node, hideTextInstance, instance);
      } else {
        hideTextInstance(instance);
      }
    } else {
      if (__DEV__) {
        runWithFiberInDEV(
          node,
          unhideTextInstance,
          instance,
          node.memoizedProps,
        );
      } else {
        unhideTextInstance(instance, node.memoizedProps);
      }
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(node, node.return, error);
  }
}

function isHostParent(fiber: Fiber): boolean {
  return (
    fiber.tag === HostComponent ||
    fiber.tag === HostRoot ||
    // $FlowFixMe[constant-condition]
    (supportsResources ? fiber.tag === HostHoistable : false) ||
    // $FlowFixMe[constant-condition]
    (supportsSingletons
      ? fiber.tag === HostSingleton && isSingletonScope(fiber.type)
      : false) ||
    fiber.tag === HostPortal ||
    fiber.tag === HostBlockSlot
  );
}

function getHostSibling(fiber: Fiber): ?Instance {
  // We're going to search forward into the tree until we find a sibling host
  // node. Unfortunately, if multiple insertions are done in a row we have to
  // search past them. This leads to exponential search for the next sibling.
  // TODO: Find a more efficient way to do this.
  let node: Fiber = fiber;
  siblings: while (true) {
    // If we didn't find anything, let's try the next sibling.
    while (node.sibling === null) {
      if (node.return === null || isHostParent(node.return)) {
        // If we pop out of the root or hit the parent the fiber we are the
        // last sibling.
        return null;
      }
      // $FlowFixMe[incompatible-type] found when upgrading Flow
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
    while (
      node.tag !== HostComponent &&
      node.tag !== HostText &&
      node.tag !== HostBlock &&
      node.tag !== DehydratedFragment
    ) {
      // If this is a host singleton we go deeper if it's not a special
      // singleton scope. If it is a singleton scope we skip over it because
      // you only insert against this scope when you are already inside of it
      if (
        // $FlowFixMe[constant-condition]
        supportsSingletons &&
        node.tag === HostSingleton &&
        isSingletonScope(node.type)
      ) {
        continue siblings;
      }

      // If it is not host node and, we might have a host node inside it.
      // Try to search down until we find one.
      if (node.flags & Placement) {
        // If we don't have a child, try the siblings instead.
        continue siblings;
      }
      // If we don't have a child, try the siblings instead.
      // We also skip portals because they are not part of this host tree.
      if (node.child === null || node.tag === HostPortal) {
        continue siblings;
      } else {
        node.child.return = node;
        node = node.child;
      }
    }
    // Check if this host node is stable or about to be placed.
    if (!(node.flags & Placement)) {
      // Found it!
      return node.stateNode;
    }
  }
}

// Returns the node to insert new content of slot `slotIndex` of `block`
// before: the first node rendered by a later slot at the same position (inline
// content, or a host node of a slot fiber), or else the static node that
// follows the slot (null when the slot ends its parent). During placement,
// host nodes that are not yet placed are skipped; once the block's children
// have been committed (`childrenCommitted`), every host node is in place.
function getBlockSlotInsertionPoint(
  block: Fiber,
  slotIndex: number,
  childrenCommitted: boolean,
): null | Instance | TextInstance {
  const template = block.type;
  const position = getBlockSlotPosition(template, slotIndex);
  const slotCount = getBlockSlotCount(template);
  for (
    let i = slotIndex + 1;
    i < slotCount && getBlockSlotPosition(template, i) === position;
    i++
  ) {
    const inlineNode = getBlockSlotInlineNode(block.stateNode, i);
    if (inlineNode !== null) {
      return inlineNode as any;
    }
    let slot = block.child;
    while (slot !== null && slot.index !== i) {
      slot = slot.sibling;
    }
    if (slot !== null) {
      const hostNode = getFirstStableHostNode(slot, childrenCommitted);
      if (hostNode !== null) {
        return hostNode;
      }
    }
  }
  return getBlockSlotNextStaticSibling(block.stateNode, slotIndex) as any;
}

// The first host node below `parent` (not descending into portals or other
// host nodes) that is already in the DOM. Nodes with a pending placement are
// not in the DOM yet, unless the placements have been committed.
function getFirstStableHostNode(
  parent: Fiber,
  placementsCommitted: boolean,
): Instance | null {
  let node: Fiber | null = parent.child;
  while (node !== null) {
    let current: Fiber = node;
    if (
      current.tag === HostComponent ||
      current.tag === HostText ||
      current.tag === HostBlock
    ) {
      if (placementsCommitted || !(current.flags & Placement)) {
        return current.stateNode;
      }
    } else if (
      current.tag !== HostPortal &&
      (placementsCommitted || !(current.flags & Placement)) &&
      current.child !== null
    ) {
      const child: Fiber = current.child;
      child.return = current;
      node = child;
      continue;
    }
    while (current.sibling === null) {
      const returnFiber: Fiber | null = current.return;
      if (returnFiber === null || returnFiber === parent) {
        return null;
      }
      current = returnFiber;
    }
    const sibling: Fiber = current.sibling;
    sibling.return = current.return;
    node = sibling;
  }
  return null;
}

function insertOrAppendPlacementNodeIntoContainer(
  node: Fiber,
  before: ?Instance,
  parent: Container,
  parentFragmentInstances: null | Array<FragmentInstanceType>,
): void {
  const {tag} = node;
  const isHost = tag === HostComponent || tag === HostText || tag === HostBlock;
  if (isHost) {
    const stateNode = node.stateNode;
    if (before) {
      insertInContainerBefore(parent, stateNode, before);
    } else {
      appendChildToContainer(parent, stateNode);
    }
    if (enableFragmentRefs) {
      commitNewChildToFragmentInstances(node, parentFragmentInstances);
    }
    trackHostMutation();
    return;
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
    return;
  }

  // $FlowFixMe[constant-condition]
  if (supportsSingletons ? tag === HostSingleton : false) {
    if (enableFragmentRefs) {
      // The singleton is the fragment child. Its own children are not
      // attributed to the fragment instances above it.
      commitNewChildToFragmentInstances(node, parentFragmentInstances);
      parentFragmentInstances = null;
    }
    if (isSingletonScope(node.type)) {
      // This singleton is the parent of deeper nodes and needs to become
      // the parent for child insertions and appends
      parent = node.stateNode;
      before = null;
    }
  }

  const child = node.child;
  if (child !== null) {
    insertOrAppendPlacementNodeIntoContainer(
      child,
      before,
      parent,
      parentFragmentInstances,
    );
    let sibling = child.sibling;
    while (sibling !== null) {
      insertOrAppendPlacementNodeIntoContainer(
        sibling,
        before,
        parent,
        parentFragmentInstances,
      );
      sibling = sibling.sibling;
    }
  }
}

function insertOrAppendPlacementNode(
  node: Fiber,
  before: ?Instance,
  parent: Instance,
  parentFragmentInstances: null | Array<FragmentInstanceType>,
): void {
  const {tag} = node;
  const isHost = tag === HostComponent || tag === HostText || tag === HostBlock;
  if (isHost) {
    const stateNode = node.stateNode;
    if (before) {
      insertBefore(parent, stateNode, before);
    } else {
      appendChild(parent, stateNode);
    }
    if (enableFragmentRefs) {
      commitNewChildToFragmentInstances(node, parentFragmentInstances);
    }
    trackHostMutation();
    return;
  } else if (tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
    return;
  }

  // $FlowFixMe[constant-condition]
  if (supportsSingletons ? tag === HostSingleton : false) {
    if (enableFragmentRefs) {
      // The singleton is the fragment child. Its own children are not
      // attributed to the fragment instances above it.
      commitNewChildToFragmentInstances(node, parentFragmentInstances);
      parentFragmentInstances = null;
    }
    if (isSingletonScope(node.type)) {
      // This singleton is the parent of deeper nodes and needs to become
      // the parent for child insertions and appends
      parent = node.stateNode;
    }
  }

  const child = node.child;
  if (child !== null) {
    insertOrAppendPlacementNode(child, before, parent, parentFragmentInstances);
    let sibling = child.sibling;
    while (sibling !== null) {
      insertOrAppendPlacementNode(
        sibling,
        before,
        parent,
        parentFragmentInstances,
      );
      sibling = sibling.sibling;
    }
  }
}

function commitPlacement(finishedWork: Fiber): void {
  // Recursively insert all host nodes into the parent.
  let hostParentFiber;
  let parentFiber = finishedWork.return;
  while (parentFiber !== null) {
    if (isHostParent(parentFiber)) {
      hostParentFiber = parentFiber;
      break;
    }
    parentFiber = parentFiber.return;
  }
  // Fragment ancestry is collected separately so portals remain placement
  // parents while fragment bookkeeping still walks past them to ancestors.
  const parentFragmentInstances = enableFragmentRefs
    ? getParentFragmentInstances(finishedWork)
    : null;

  // $FlowFixMe[constant-condition]
  if (!supportsMutation) {
    if (enableFragmentRefs) {
      commitImmutablePlacementNodeToFragmentInstances(
        finishedWork,
        parentFragmentInstances,
      );
    }
    return;
  }

  if (hostParentFiber == null) {
    throw new Error(
      'Expected to find a host parent. This error is likely caused by a bug ' +
        'in React. Please file an issue.',
    );
  }

  switch (hostParentFiber.tag) {
    case HostSingleton: {
      // $FlowFixMe[constant-condition]
      if (supportsSingletons) {
        const parent: Instance = hostParentFiber.stateNode;
        const before = getHostSibling(finishedWork);
        // We only have the top Fiber that was inserted but we need to recurse down its
        // children to find all the terminal nodes.
        insertOrAppendPlacementNode(
          finishedWork,
          before,
          parent,
          parentFragmentInstances,
        );
        break;
      }
      // Fall through
    }
    case HostComponent: {
      const parent: Instance = hostParentFiber.stateNode;
      if (hostParentFiber.flags & ContentReset) {
        // Reset the text content of the parent before doing any insertions
        resetTextContent(parent);
        // Clear ContentReset from the effect tag
        hostParentFiber.flags &= ~ContentReset;
      }

      const before = getHostSibling(finishedWork);
      // We only have the top Fiber that was inserted but we need to recurse down its
      // children to find all the terminal nodes.
      insertOrAppendPlacementNode(
        finishedWork,
        before,
        parent,
        parentFragmentInstances,
      );
      break;
    }
    case HostBlockSlot: {
      if (hostParentFiber.memoizedProps.list !== null) {
        // The block positions the items of a list, including those with
        // fibers, when it commits.
        break;
      }
      const block: Fiber = hostParentFiber.return as any;
      const slotIndex = hostParentFiber.index;
      const parent: Instance = getBlockSlotParent(block.stateNode, slotIndex);
      // The insertion point may be a text node, which is a valid reference
      // node for insertBefore.
      const before: ?Instance =
        getHostSibling(finishedWork) ??
        (getBlockSlotInsertionPoint(block, slotIndex, false) as any);
      insertOrAppendPlacementNode(
        finishedWork,
        before,
        parent,
        parentFragmentInstances,
      );
      break;
    }
    case HostRoot:
    case HostPortal: {
      const parent: Container = hostParentFiber.stateNode.containerInfo;
      const before = getHostSibling(finishedWork);
      insertOrAppendPlacementNodeIntoContainer(
        finishedWork,
        before,
        parent,
        parentFragmentInstances,
      );
      break;
    }
    default:
      throw new Error(
        'Invalid host parent fiber. This error is likely caused by a bug ' +
          'in React. Please file an issue.',
      );
  }
}

function commitImmutablePlacementNodeToFragmentInstances(
  finishedWork: Fiber,
  parentFragmentInstances: null | Array<FragmentInstanceType>,
): void {
  if (!enableFragmentRefs) {
    return;
  }
  const isHost =
    finishedWork.tag === HostComponent ||
    // $FlowFixMe[constant-condition]
    (supportsSingletons ? finishedWork.tag === HostSingleton : false);
  if (isHost) {
    // A singleton is the fragment child itself, so its own children are
    // not attributed to the fragment instances above it.
    commitNewChildToFragmentInstances(finishedWork, parentFragmentInstances);
    return;
  } else if (finishedWork.tag === HostPortal) {
    // If the insertion itself is a portal, then we don't want to traverse
    // down its children. Instead, we'll get insertions from each child in
    // the portal directly.
    return;
  }

  const child = finishedWork.child;
  if (child !== null) {
    commitImmutablePlacementNodeToFragmentInstances(
      child,
      parentFragmentInstances,
    );
    let sibling = child.sibling;
    while (sibling !== null) {
      commitImmutablePlacementNodeToFragmentInstances(
        sibling,
        parentFragmentInstances,
      );
      sibling = sibling.sibling;
    }
  }
}

export function commitHostPlacement(finishedWork: Fiber) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(finishedWork, commitPlacement, finishedWork);
    } else {
      commitPlacement(finishedWork);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostRemoveChildFromContainer(
  deletedFiber: Fiber,
  nearestMountedAncestor: Fiber,
  parentContainer: Container,
  hostInstance: Instance | TextInstance,
) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        deletedFiber,
        removeChildFromContainer,
        parentContainer,
        hostInstance,
      );
    } else {
      removeChildFromContainer(parentContainer, hostInstance);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
  }
}

export function commitHostRemoveChild(
  deletedFiber: Fiber,
  nearestMountedAncestor: Fiber,
  parentInstance: Instance,
  hostInstance: Instance | TextInstance,
) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        deletedFiber,
        removeChild,
        parentInstance,
        hostInstance,
      );
    } else {
      removeChild(parentInstance, hostInstance);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
  }
}

export function commitHostRootContainerChildren(
  root: FiberRoot,
  finishedWork: Fiber,
) {
  const containerInfo = root.containerInfo;
  const pendingChildren = root.pendingChildren;
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        replaceContainerChildren,
        containerInfo,
        pendingChildren,
      );
    } else {
      replaceContainerChildren(containerInfo, pendingChildren);
    }
    trackHostMutation();
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostPortalContainerChildren(
  portal: {
    containerInfo: Container,
    pendingChildren: ChildSet,
    ...
  },
  finishedWork: Fiber,
  pendingChildren: ChildSet,
) {
  const containerInfo = portal.containerInfo;
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        replaceContainerChildren,
        containerInfo,
        pendingChildren,
      );
    } else {
      replaceContainerChildren(containerInfo, pendingChildren);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostHydratedContainer(
  root: FiberRoot,
  finishedWork: Fiber,
) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitHydratedContainer,
        root.containerInfo,
      );
    } else {
      commitHydratedContainer(root.containerInfo);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostHydratedActivity(
  activityInstance: ActivityInstance,
  finishedWork: Fiber,
) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitHydratedActivityInstance,
        activityInstance,
      );
    } else {
      commitHydratedActivityInstance(activityInstance);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostHydratedSuspense(
  suspenseInstance: SuspenseInstance,
  finishedWork: Fiber,
) {
  try {
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        commitHydratedSuspenseInstance,
        suspenseInstance,
      );
    } else {
      commitHydratedSuspenseInstance(suspenseInstance);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostSingletonAcquisition(finishedWork: Fiber) {
  const singleton = finishedWork.stateNode;
  const props = finishedWork.memoizedProps;

  try {
    // This was a new mount, acquire the DOM instance and set initial properties
    if (__DEV__) {
      runWithFiberInDEV(
        finishedWork,
        acquireSingletonInstance,
        finishedWork.type,
        props,
        singleton,
        finishedWork,
      );
    } else {
      acquireSingletonInstance(
        finishedWork.type,
        props,
        singleton,
        finishedWork,
      );
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}

export function commitHostSingletonRelease(releasingWork: Fiber) {
  if (__DEV__) {
    runWithFiberInDEV(
      releasingWork,
      releaseSingletonInstance,
      releasingWork.stateNode,
      releasingWork.type,
      releasingWork.memoizedProps,
    );
  } else {
    releaseSingletonInstance(
      releasingWork.stateNode,
      releasingWork.type,
      releasingWork.memoizedProps,
    );
  }
}
