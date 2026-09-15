/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Compiled DOM blocks.
//
// A block template describes a subtree of HTML host elements whose structure
// is fixed at compile time. Every dynamic part is a numbered "hole":
//
// - a prop hole sets one attribute or property with the same semantics as a
//   host component prop (`setProp`),
// - an event hole holds an event listener that the React event system
//   dispatches exactly like a host component's `on*` prop,
// - a text hole holds a string or number rendered as a text node,
// - a slot hole holds arbitrary React children.
//
// Slot values that React renders as text, as nothing, or as a list of keyed
// block elements are rendered by the block itself ("inline" slot content; see
// getBlockSlotValueKind). Every other slot value is rendered by a HostBlockSlot
// fiber whose host nodes are inserted at the slot's position inside the block.
//
// The items of a list are block instances. Most have no fiber; an item that
// needs one (because one of its slots holds children that need fibers) is the
// host instance of a HostBlock fiber, a child of the slot's HostBlockSlot
// fiber. The block owns the order of all items: the list is reconciled here by
// key and template: common prefix and suffix first, then a keyed match of the
// remaining items, moving only the items that are not part of the longest
// increasing subsequence of their previous positions. Items without fibers are
// created, updated and removed here; items with fibers are updated and removed
// by the reconciler and only positioned here.
//
// An `input` element is managed as a whole: all of its props, static and
// dynamic, go through React DOM's own input handling (`setInitialProperties`
// and `updateProperties`), so controlled values, value tracking and change
// events behave exactly as for a host component.
//
// Description format (produced by the compiler):
//
//   Node  = [tag, staticProps | null, dynamicProps | null, children]
//   dynamicProps = Array<[propName, holeIndex]>
//   Child = string        // static text
//         | Node          // static element
//         | {t: holeIndex} // text hole
//         | {s: holeIndex} // slot hole
//
// The analysis of a description is independent of the DOM. The prototype DOM
// subtree is built once per document; instances are deep clones of it.

import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';

import {REACT_ELEMENT_TYPE, REACT_LIST_CHANGES} from 'shared/ReactSymbols';
import isArray from 'shared/isArray';
import hasOwnProperty from 'shared/hasOwnProperty';

import {
  setBlockProp,
  setInitialProperties,
  updateProperties,
} from './ReactDOMComponent';
import {
  precacheFiberNode,
  setBlockEventNodeData,
  getBlockEventNodeData,
  setBlockInstanceData,
  getBlockInstanceData,
  updateFiberProps,
} from './ReactDOMComponentTree';

import type {
  BlockNodeDescription,
  BlockTemplate,
} from '../shared/ReactDOMBlockTemplate';
import {isBlockTemplate} from '../shared/ReactDOMBlockTemplate';

const PROP_HOLE = 0;
const EVENT_HOLE = 1;
const TEXT_HOLE = 2;
const SLOT_HOLE = 3;
const INPUT_HOLE = 4;

type Hole =
  | {kind: 0, ref: number, tag: string, name: string}
  | {kind: 1, ref: number, name: string}
  | {kind: 2, ref: number}
  | {kind: 3, slot: number}
  | {kind: 4, input: number, name: string};

type Slot = {
  hole: number,
  // Reference to the element that contains the slot.
  parentRef: number,
  // Reference to the static node that follows the slot in its parent, or -1
  // if the slot is at the end of its parent.
  nextStaticRef: number,
  // Slots with the same position are adjacent in the same parent, with no
  // static node between them.
  position: number,
  // The slot is the only child of its parent element.
  soleChild: boolean,
};

type Input = {
  ref: number,
  staticProps: {+[propName: string]: mixed},
  dynamicProps: $ReadOnlyArray<[string, number]>,
};

// An event hole, or an event prop of an input.
type EventHole = {
  hole: number,
  ref: number,
  name: string,
};

type BlockAnalysis = {
  // Child index paths, from the block root, of every node a hole refers to.
  refPaths: Array<Array<number>>,
  holes: Array<Hole>,
  slots: Array<Slot>,
  inputs: Array<Input>,
  eventHoles: Array<EventHole>,
  positionCount: number,
  // The root element's `style`: the index of its hole, or -1 with the static
  // value (undefined if it has none).
  rootStyleHole: number,
  rootStaticStyle: mixed,
};

export type BlockValues = $ReadOnlyArray<mixed>;

// The inline content of a slot: nothing, a text node, or the items of a list.
type SlotContent = null | Text | Array<BlockInstanceData>;

export type BlockInstanceData = {
  template: BlockTemplate,
  root: Element,
  // The key of an inline list item; null for a block rendered by a fiber.
  key: null | string,
  refs: Array<Node>,
  // The committed hole values. Event listeners are read from here.
  values: BlockValues,
  // Inline content of each slot, by slot index.
  slotContents: null | Array<SlotContent>,
  // The current props of each input, by input index.
  inputProps: null | Array<Object>,
  // The instance belongs to a HostBlock fiber (created for it, or adopted from
  // an inline list item by adoptBlockInlineItem). The reconciler updates and
  // removes it; a list only positions it.
  ownedByFiber: boolean,
};

export {isBlockTemplate};

function isEventPropName(name: string): boolean {
  return (
    name.length > 2 &&
    name.charCodeAt(0) === 111 /* o */ &&
    name.charCodeAt(1) === 110 /* n */ &&
    name.charCodeAt(2) >= 65 /* A */ &&
    name.charCodeAt(2) <= 90 /* Z */
  );
}

function getBlockAnalysis(template: BlockTemplate): BlockAnalysis {
  const existing: null | BlockAnalysis = template._analysis as any;
  if (existing !== null) {
    return existing;
  }
  const analysis: BlockAnalysis = {
    refPaths: [],
    holes: [],
    slots: [],
    inputs: [],
    eventHoles: [],
    positionCount: 0,
    rootStyleHole: -1,
    rootStaticStyle: undefined,
  };
  const rootNode = template.description;
  const rootStaticProps = rootNode[1];
  if (
    rootStaticProps !== null &&
    hasOwnProperty.call(rootStaticProps, 'style')
  ) {
    analysis.rootStaticStyle = rootStaticProps.style;
  }
  const rootDynamicProps = rootNode[2];
  if (rootDynamicProps !== null) {
    for (let i = 0; i < rootDynamicProps.length; i++) {
      if (rootDynamicProps[i][0] === 'style') {
        analysis.rootStyleHole = rootDynamicProps[i][1];
      }
    }
  }
  analyzeNode(analysis, rootNode, []);
  for (let i = 0; i < analysis.holes.length; i++) {
    if (analysis.holes[i] === undefined) {
      throw new Error(
        'Invalid block template: hole ' + i + ' is not used by the template.',
      );
    }
  }
  template._analysis = analysis;
  return analysis;
}

function addRef(analysis: BlockAnalysis, path: Array<number>): number {
  analysis.refPaths.push(path.slice());
  return analysis.refPaths.length - 1;
}

function setHole(analysis: BlockAnalysis, index: number, hole: Hole): void {
  if (analysis.holes[index] !== undefined) {
    throw new Error(
      'Invalid block template: hole ' + index + ' is used more than once.',
    );
  }
  analysis.holes[index] = hole;
}

function analyzeNode(
  analysis: BlockAnalysis,
  node: BlockNodeDescription,
  path: Array<number>,
): void {
  const tag = node[0];
  const staticProps = node[1];
  const dynamicProps = node[2];
  const children = node[3];
  if (tag === 'input') {
    if (children.length !== 0) {
      throw new Error('Invalid block template: an input cannot have children.');
    }
    const inputIndex = analysis.inputs.length;
    const ref = addRef(analysis, path);
    analysis.inputs.push({
      ref,
      staticProps: staticProps === null ? {} : staticProps,
      dynamicProps: dynamicProps === null ? [] : dynamicProps,
    });
    if (dynamicProps !== null) {
      for (let i = 0; i < dynamicProps.length; i++) {
        const [name, holeIndex] = dynamicProps[i];
        setHole(analysis, holeIndex, {
          kind: INPUT_HOLE,
          input: inputIndex,
          name,
        });
        if (isEventPropName(name)) {
          analysis.eventHoles.push({hole: holeIndex, ref, name});
        }
      }
    }
    return;
  }
  let elementRef = -1;
  const getElementRef = () => {
    if (elementRef === -1) {
      elementRef = addRef(analysis, path);
    }
    return elementRef;
  };
  if (dynamicProps !== null) {
    for (let i = 0; i < dynamicProps.length; i++) {
      const [name, holeIndex] = dynamicProps[i];
      if (isEventPropName(name)) {
        const ref = getElementRef();
        setHole(analysis, holeIndex, {kind: EVENT_HOLE, ref, name});
        analysis.eventHoles.push({hole: holeIndex, ref, name});
      } else {
        setHole(analysis, holeIndex, {
          kind: PROP_HOLE,
          ref: getElementRef(),
          tag,
          name,
        });
      }
    }
  }
  // Slots that still need the next static node in this parent.
  let pendingSlots: Array<Slot> = [];
  let domIndex = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (typeof child === 'object' && !isArray(child)) {
      const slotHole: mixed = (child as any).s;
      if (typeof slotHole === 'number') {
        const slot: Slot = {
          hole: slotHole,
          parentRef: getElementRef(),
          nextStaticRef: -1,
          position:
            pendingSlots.length > 0
              ? pendingSlots[0].position
              : analysis.positionCount++,
          soleChild: children.length === 1,
        };
        analysis.slots.push(slot);
        setHole(analysis, slotHole, {
          kind: SLOT_HOLE,
          slot: analysis.slots.length - 1,
        });
        pendingSlots.push(slot);
        continue;
      }
    }
    // Every other child produces exactly one DOM node at domIndex.
    const childPath = path.concat(domIndex);
    if (pendingSlots.length > 0) {
      const nextStaticRef = addRef(analysis, childPath);
      for (let j = 0; j < pendingSlots.length; j++) {
        pendingSlots[j].nextStaticRef = nextStaticRef;
      }
      pendingSlots = [];
    }
    if (typeof child === 'string') {
      // Static text.
    } else if (isArray(child)) {
      analyzeNode(analysis, child as any, childPath);
    } else if (typeof child.t === 'number') {
      setHole(analysis, child.t, {
        kind: TEXT_HOLE,
        ref: addRef(analysis, childPath),
      });
    } else {
      throw new Error('Invalid block template child.');
    }
    domIndex++;
  }
}

function getBlockPrototype(
  template: BlockTemplate,
  ownerDocument: Document,
): Element {
  const existing = template._prototype;
  if (existing !== null && template._prototypeDocument === ownerDocument) {
    return existing;
  }
  const prototype = buildNode(template.description, ownerDocument);
  template._prototype = prototype;
  template._prototypeDocument = ownerDocument;
  return prototype;
}

function buildNode(
  node: BlockNodeDescription,
  ownerDocument: Document,
): Element {
  const tag = node[0];
  const staticProps = node[1];
  const children = node[3];
  const element = ownerDocument.createElement(tag);
  if (tag === 'input') {
    // All props of an input are applied per instance by setInitialProperties.
    return element;
  }
  if (staticProps !== null) {
    for (const name in staticProps) {
      if (isEventPropName(name)) {
        throw new Error(
          'Invalid block template: event listener "' +
            name +
            '" must be a dynamic prop.',
        );
      }
      setBlockProp(element, tag, name, staticProps[name], null);
    }
  }
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (typeof child === 'string') {
      element.appendChild(ownerDocument.createTextNode(child));
    } else if (isArray(child)) {
      element.appendChild(buildNode(child as any, ownerDocument));
    } else if (typeof child === 'object') {
      if (typeof (child as any).t === 'number') {
        element.appendChild(ownerDocument.createTextNode(''));
      }
      // Slots have no DOM node of their own.
    }
  }
  return element;
}

function toTextContent(value: mixed): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    // $FlowFixMe[unsafe-addition]
    return '' + value;
  }
  return '';
}

export function getBlockSlotCount(template: BlockTemplate): number {
  return getBlockAnalysis(template).slots.length;
}

export function getBlockSlotValue(
  template: BlockTemplate,
  values: BlockValues,
  slotIndex: number,
): mixed {
  return values[getBlockAnalysis(template).slots[slotIndex].hole];
}

export function getBlockSlotPosition(
  template: BlockTemplate,
  slotIndex: number,
): number {
  return getBlockAnalysis(template).slots[slotIndex].position;
}

// -----------------------------------------------------------------------------
// Inline slot content
// -----------------------------------------------------------------------------

// How a slot renders a value (see BlockSlotValueKind).
export opaque type BlockSlotValueKind = 0 | 1 | 2;
// Rendered by the block itself: values that React renders as a single text
// node or as nothing (mirroring reconcileChildFibers).
export const BlockSlotInline: BlockSlotValueKind = 0;
// A list: an array whose items are all elements with a string key whose type
// is a block template. The block renders the items, and the reconciler gives a
// fiber to the items that need one (see blockListItemNeedsFiber).
export const BlockSlotList: BlockSlotValueKind = 1;
// Everything else is rendered by a HostBlockSlot fiber.
export const BlockSlotFiber: BlockSlotValueKind = 2;

export function getBlockSlotValueKind(value: mixed): BlockSlotValueKind {
  if (value === null || value === undefined) {
    return BlockSlotInline;
  }
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
    case 'bigint':
      return BlockSlotInline;
    case 'object':
      return isArray(value) && isBlockList(value)
        ? BlockSlotList
        : BlockSlotFiber;
  }
  return BlockSlotFiber;
}

function isBlockList(children: $ReadOnlyArray<mixed>): boolean {
  let knownKeys: null | Set<string> = null;
  for (let i = 0; i < children.length; i++) {
    const child: any = children[i];
    if (
      typeof child !== 'object' ||
      child === null ||
      child.$$typeof !== REACT_ELEMENT_TYPE ||
      typeof child.key !== 'string' ||
      !isBlockTemplate(child.type)
    ) {
      return false;
    }
    if (__DEV__) {
      // In development, a list with duplicate keys is reconciled by fibers so
      // that React warns about it exactly as for any other list (same
      // message, count and component stack). In production, duplicates are
      // handled by reconcileList.
      if (knownKeys === null) {
        knownKeys = new Set();
      }
      if (knownKeys.has(child.key)) {
        return false;
      }
      knownKeys.add(child.key);
    }
  }
  return true;
}

// If `list` was produced from `previousList` by the `map` of
// unstable_useListItemMemoCache (react/compiler-runtime), which records the
// items it replaced (REACT_LIST_CHANGES), returns the ascending indices of
// those items; every other item is the same element as in `previousList`.
// Returns null otherwise, and when a replaced item does not have the key and
// type of the item it replaces, so that callers only need to look at the
// replaced items to know that `list` is a list of keyed blocks if
// `previousList` was one (with the same keys, in the same order).
export function getBlockListChanges(
  list: mixed,
  previousList: mixed,
): null | $ReadOnlyArray<number> {
  if (!isArray(list) || !isArray(previousList)) {
    return null;
  }
  const changes: mixed = (list as any)[REACT_LIST_CHANGES];
  if (
    changes == null ||
    (changes as any).base !== previousList ||
    list.length !== previousList.length
  ) {
    return null;
  }
  const indices: $ReadOnlyArray<number> = (changes as any).indices;
  for (let i = 0; i < indices.length; i++) {
    const child: any = list[indices[i]];
    const previous: any = previousList[indices[i]];
    if (
      typeof child !== 'object' ||
      child === null ||
      child.$$typeof !== REACT_ELEMENT_TYPE ||
      typeof previous !== 'object' ||
      previous === null ||
      child.key !== previous.key ||
      child.type !== previous.type
    ) {
      return null;
    }
  }
  if (__DEV__) {
    let next = 0;
    for (let i = 0; i < list.length; i++) {
      if (next < indices.length && indices[next] === i) {
        next++;
      } else if (list[i] !== previousList[i]) {
        console.error(
          'React Compiler list changes are inconsistent: item %s differs ' +
            'from the previous list but is not recorded as changed. This is ' +
            'a bug in React.',
          i,
        );
        return null;
      }
    }
  }
  return indices;
}

// Whether an item of a list (a keyed block element) needs a fiber: one of its
// slots needs a fiber, or holds a list with an item that does.
// `previousInlineItem` is the element at the same index of a value of the same
// slot that was rendered without fibers (or null); the same element was
// already checked. Elements and their values are immutable once rendered.
export function blockListItemNeedsFiber(
  element: mixed,
  previousInlineItem: mixed,
): boolean {
  if (element === previousInlineItem) {
    return false;
  }
  const child: any = element;
  const values: BlockValues = child.props.v;
  const slots = getBlockAnalysis(child.type).slots;
  for (let j = 0; j < slots.length; j++) {
    const value = values[slots[j].hole];
    const kind = getBlockSlotValueKind(value);
    if (kind === BlockSlotFiber) {
      return true;
    }
    if (kind === BlockSlotList) {
      const items: $ReadOnlyArray<mixed> = value as any;
      for (let k = 0; k < items.length; k++) {
        if (blockListItemNeedsFiber(items[k], null)) {
          return true;
        }
      }
    }
  }
  return false;
}

function isEmptySlotValue(value: mixed): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    value === ''
  );
}

// Whether committing a change of a slot's value from `oldValue` to `newValue`
// can change the block's inline content. Values that both need fibers are
// reconciled by the slot fiber.
export function blockSlotNeedsCommit(
  oldValue: mixed,
  newValue: mixed,
): boolean {
  if (oldValue === newValue) {
    return false;
  }
  if (isEmptySlotValue(oldValue) && isEmptySlotValue(newValue)) {
    return false;
  }
  const oldIsText = isTextSlotValue(oldValue);
  const newIsText = isTextSlotValue(newValue);
  if (oldIsText && newIsText) {
    return toTextContent(oldValue) !== toTextContent(newValue);
  }
  // Arrays may be inline lists; anything else that is neither empty nor text
  // is rendered by fibers.
  return (
    oldIsText ||
    newIsText ||
    isEmptySlotValue(oldValue) ||
    isEmptySlotValue(newValue) ||
    isArray(oldValue) ||
    isArray(newValue)
  );
}

function isTextSlotValue(value: mixed): boolean {
  return (
    (typeof value === 'string' && value !== '') ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  );
}

// The first DOM node of a slot's inline content, or null if it has none.
export function getBlockSlotInlineNode(
  root: Element,
  slotIndex: number,
): null | Node {
  return getSlotFirstNode(getBlockInstanceData(root), slotIndex);
}

function getSlotFirstNode(
  data: BlockInstanceData,
  slotIndex: number,
): null | Node {
  const slotContents = data.slotContents;
  if (slotContents === null) {
    return null;
  }
  const content = slotContents[slotIndex];
  if (content === null) {
    return null;
  }
  if (isArray(content)) {
    return content.length > 0 ? content[0].root : null;
  }
  return content;
}

// Sets the inline content of a slot of a block rendered by a fiber. `value`
// must be of kind BlockSlotInline or BlockSlotList; null removes the inline
// content (for a slot that now renders through a fiber). For a list,
// `fiberItems[i]` is the host instance of the fiber of item i, or null for an
// item without a fiber. New nodes are inserted before `before`, which must
// follow the slot's content.
// `previousValue` is the value the slot's current content was rendered from
// (null if it has none).
export function setBlockSlotContent(
  root: Element,
  slotIndex: number,
  value: mixed,
  previousValue: mixed,
  before: null | Node,
  fiberItems: null | $ReadOnlyArray<null | Element>,
): void {
  setSlotContent(
    getBlockInstanceData(root),
    slotIndex,
    value,
    previousValue,
    before,
    fiberItems,
  );
}

function setSlotContent(
  data: BlockInstanceData,
  slotIndex: number,
  value: mixed,
  previousValue: mixed,
  before: null | Node,
  fiberItems: null | $ReadOnlyArray<null | Element> = null,
): void {
  const slotContents: Array<SlotContent> = data.slotContents as any;
  const existing = slotContents[slotIndex];
  const slot = getBlockAnalysis(data.template).slots[slotIndex];
  const parent: Element = data.refs[slot.parentRef] as any;
  if (isEmptySlotValue(value)) {
    if (existing !== null) {
      removeSlotContent(parent, existing);
      slotContents[slotIndex] = null;
    }
    return;
  }
  if (isArray(value)) {
    if (existing !== null && isArray(existing)) {
      slotContents[slotIndex] = reconcileList(
        parent,
        existing,
        value,
        previousValue,
        before,
        slot.soleChild,
        fiberItems,
      );
    } else {
      if (existing !== null) {
        removeSlotContent(parent, existing);
      }
      slotContents[slotIndex] = mountList(parent, value, before, fiberItems);
    }
    return;
  }
  const text = toTextContent(value);
  if (existing !== null && !isArray(existing)) {
    if (existing.nodeValue !== text) {
      existing.nodeValue = text;
    }
    return;
  }
  if (existing !== null) {
    removeSlotContent(parent, existing);
  }
  const ownerDocument: Document = parent.ownerDocument as any;
  const node = ownerDocument.createTextNode(text);
  parent.insertBefore(node, before);
  slotContents[slotIndex] = node;
}

// Removes the items without fibers in oldItems[start..end].
function removeItems(
  parent: Element,
  oldItems: $ReadOnlyArray<BlockInstanceData>,
  start: number,
  end: number,
): void {
  for (let i = start; i <= end; i++) {
    if (!oldItems[i].ownedByFiber) {
      parent.removeChild(oldItems[i].root);
    }
  }
}

function removeSlotContent(
  parent: Element,
  content: Text | Array<BlockInstanceData>,
) {
  if (isArray(content)) {
    for (let i = 0; i < content.length; i++) {
      // An item with a fiber is removed by the reconciler.
      if (!content[i].ownedByFiber) {
        parent.removeChild(content[i].root);
      }
    }
  } else {
    parent.removeChild(content);
  }
}

// The node that follows the content of `slotIndex` inside an inline block:
// the first node of a later slot at the same position, or else the static
// node after the slot.
function getInlineSlotInsertionPoint(
  data: BlockInstanceData,
  slotIndex: number,
): null | Node {
  const analysis = getBlockAnalysis(data.template);
  const slots = analysis.slots;
  const position = slots[slotIndex].position;
  for (
    let i = slotIndex + 1;
    i < slots.length && slots[i].position === position;
    i++
  ) {
    const node = getSlotFirstNode(data, i);
    if (node !== null) {
      return node;
    }
  }
  const nextStaticRef = slots[slotIndex].nextStaticRef;
  return nextStaticRef === -1 ? null : data.refs[nextStaticRef];
}

// -----------------------------------------------------------------------------
// Instances
// -----------------------------------------------------------------------------

function buildInputProps(input: Input, values: BlockValues): Object {
  const props: {[string]: mixed} = {};
  for (const name in input.staticProps) {
    props[name] = input.staticProps[name];
  }
  const dynamicProps = input.dynamicProps;
  for (let i = 0; i < dynamicProps.length; i++) {
    props[dynamicProps[i][0]] = values[dynamicProps[i][1]];
  }
  return props;
}

// Creates the DOM and instance data of a block and applies every hole other
// than slots. The caller renders the slots.
function createInstanceData(
  template: BlockTemplate,
  values: BlockValues,
  ownerDocument: Document,
  key: null | string,
): BlockInstanceData {
  const analysis = getBlockAnalysis(template);
  const root: Element = getBlockPrototype(template, ownerDocument).cloneNode(
    true,
  ) as any;
  const refPaths = analysis.refPaths;
  const refs: Array<Node> = new Array(refPaths.length);
  for (let i = 0; i < refPaths.length; i++) {
    const path = refPaths[i];
    let node: Node = root;
    for (let j = 0; j < path.length; j++) {
      let child: Node = node.firstChild as any;
      for (let k = path[j]; k > 0; k--) {
        child = child.nextSibling as any;
      }
      node = child;
    }
    refs[i] = node;
  }
  const slotCount = analysis.slots.length;
  const inputs = analysis.inputs;
  const data: BlockInstanceData = {
    template,
    root,
    key,
    refs,
    values,
    slotContents:
      slotCount > 0 ? new Array<SlotContent>(slotCount).fill(null) : null,
    inputProps: inputs.length > 0 ? new Array<Object>(inputs.length) : null,
    ownedByFiber: false,
  };
  const eventHoles = analysis.eventHoles;
  for (let i = 0; i < eventHoles.length; i++) {
    setBlockEventNodeData(refs[eventHoles[i].ref] as any, data);
  }
  const holes = analysis.holes;
  for (let i = 0; i < holes.length; i++) {
    applyHole(refs, holes[i], values[i], undefined);
  }
  for (let i = 0; i < inputs.length; i++) {
    const node: Element = refs[inputs[i].ref] as any;
    const props = buildInputProps(inputs[i], values);
    setInitialProperties(node, 'input', props);
    updateFiberProps(node as any, props);
    (data.inputProps as any)[i] = props;
  }
  return data;
}

// -----------------------------------------------------------------------------
// Adoption of inline list items by fibers
// -----------------------------------------------------------------------------
//
// When a slot that renders a list inline starts to need fibers, each new block
// fiber for an element with the key and template of an item of that list
// takes over the item's DOM and instance instead of creating new ones, like a
// fiber for the same key and type keeps its host instance.

export opaque type BlockInlineItem = BlockInstanceData;

// The items of the inline list that a slot of a block renders, or null.
export function getBlockSlotInlineItems(
  root: Element,
  slotIndex: number,
): null | $ReadOnlyArray<BlockInlineItem> {
  return getInlineListItems(getBlockInstanceData(root), slotIndex);
}

// The items of the inline list that a slot of an inline item renders, or null.
export function getBlockInlineItemSlotItems(
  item: BlockInlineItem,
  slotIndex: number,
): null | $ReadOnlyArray<BlockInlineItem> {
  return getInlineListItems(item, slotIndex);
}

// The items without fibers of the list that a slot renders, or null.
function getInlineListItems(
  data: BlockInstanceData,
  slotIndex: number,
): null | $ReadOnlyArray<BlockInlineItem> {
  const slotContents = data.slotContents;
  if (slotContents === null) {
    return null;
  }
  const content = slotContents[slotIndex];
  return content !== null && isArray(content)
    ? content.filter(item => !item.ownedByFiber)
    : null;
}

export function getBlockInlineItemKey(item: BlockInlineItem): string {
  return item.key as any;
}

export function getBlockInlineItemTemplate(
  item: BlockInlineItem,
): BlockTemplate {
  return item.template;
}

export function getBlockInlineItemRoot(item: BlockInlineItem): Element {
  return item.root;
}

// Makes the instance of an inline list item the host instance of a block
// fiber. Called in the commit phase.
export function adoptBlockInlineItem(
  item: BlockInlineItem,
  internalInstanceHandle: Fiber,
): void {
  item.ownedByFiber = true;
  precacheFiberNode(internalInstanceHandle, item.root);
  setBlockInstanceData(item.root, item);
}

const noRootHostProps: {+style?: mixed} = {};

// The props of a block's root element that React reads in the commit phase
// like the props of a host component (revealing a hidden instance restores
// `style.display`, view transitions restore `style.viewTransitionName`): its
// `style`, from the template or the block's values.
export function getBlockRootHostProps(
  template: BlockTemplate,
  values: BlockValues,
): {+style?: mixed} {
  const analysis = getBlockAnalysis(template);
  if (analysis.rootStyleHole !== -1) {
    return {style: values[analysis.rootStyleHole]};
  }
  if (analysis.rootStaticStyle !== undefined) {
    return {style: analysis.rootStaticStyle};
  }
  return noRootHostProps;
}

// The committed hole values of a block instance.
export function getBlockValues(root: Element): BlockValues {
  return getBlockInstanceData(root).values;
}

// Creates a block rendered by a fiber. Its slots are rendered by the
// reconciler (setBlockSlotContent for inline content, slot fibers otherwise).
export function createBlockInstance(
  template: BlockTemplate,
  values: BlockValues,
  ownerDocument: Document,
  internalInstanceHandle: Fiber,
): Element {
  const data = createInstanceData(template, values, ownerDocument, null);
  data.ownedByFiber = true;
  const root = data.root;
  precacheFiberNode(internalInstanceHandle, root);
  setBlockInstanceData(root, data);
  return root;
}

function applyHole(
  refs: Array<Node>,
  hole: Hole,
  value: mixed,
  prevValue: mixed,
): void {
  switch (hole.kind) {
    case PROP_HOLE: {
      setBlockProp(
        refs[hole.ref] as any,
        hole.tag,
        hole.name,
        value,
        prevValue === undefined ? null : prevValue,
      );
      break;
    }
    case TEXT_HOLE: {
      refs[hole.ref].nodeValue = toTextContent(value);
      break;
    }
    case EVENT_HOLE:
    case SLOT_HOLE:
    case INPUT_HOLE: {
      // Listeners are read from the committed values, slots are rendered
      // separately, and inputs are updated as a whole.
      break;
    }
  }
}

// Whether any hole other than a slot changed.
export function blockValuesChanged(
  template: BlockTemplate,
  oldValues: BlockValues,
  newValues: BlockValues,
): boolean {
  const holes = getBlockAnalysis(template).holes;
  for (let i = 0; i < holes.length; i++) {
    if (holes[i].kind !== SLOT_HOLE && oldValues[i] !== newValues[i]) {
      return true;
    }
  }
  return false;
}

// Commits the changes of every hole other than a slot and makes `newValues`
// the committed values.
function commitHoles(data: BlockInstanceData, newValues: BlockValues): void {
  const oldValues = data.values;
  const analysis = getBlockAnalysis(data.template);
  const holes = analysis.holes;
  let changedInputs: null | Array<boolean> = null;
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    if (oldValues[i] === newValues[i]) {
      continue;
    }
    if (hole.kind === INPUT_HOLE) {
      if (changedInputs === null) {
        changedInputs = new Array<boolean>(analysis.inputs.length).fill(false);
      }
      changedInputs[hole.input] = true;
    } else {
      applyHole(data.refs, hole, newValues[i], oldValues[i]);
    }
  }
  data.values = newValues;
  if (changedInputs !== null) {
    const inputProps: Array<Object> = data.inputProps as any;
    for (let i = 0; i < changedInputs.length; i++) {
      if (changedInputs[i]) {
        const input = analysis.inputs[i];
        const node: Element = data.refs[input.ref] as any;
        const nextProps = buildInputProps(input, newValues);
        updateProperties(node, 'input', inputProps[i], nextProps);
        updateFiberProps(node as any, nextProps);
        inputProps[i] = nextProps;
      }
    }
  }
}

// Commits the changes of every hole of a block rendered by a fiber other than
// its slots, which the reconciler commits.
export function commitBlockUpdate(
  root: Element,
  template: BlockTemplate,
  oldValues: BlockValues,
  newValues: BlockValues,
): void {
  commitHoles(getBlockInstanceData(root), newValues);
}

export function getBlockSlotParent(root: Element, slotIndex: number): Element {
  const data = getBlockInstanceData(root);
  const slot = getBlockAnalysis(data.template).slots[slotIndex];
  return data.refs[slot.parentRef] as any;
}

export function getBlockSlotNextStaticSibling(
  root: Element,
  slotIndex: number,
): Node | null {
  const data = getBlockInstanceData(root);
  const slot = getBlockAnalysis(data.template).slots[slotIndex];
  return slot.nextStaticRef === -1 ? null : data.refs[slot.nextStaticRef];
}

// The listener for `reactName` on a node inside a block, read from the
// committed values of the block instance the node belongs to.
export function getBlockEventListener(
  node: Node,
  reactName: string,
): null | Function {
  const data = getBlockEventNodeData(node);
  if (data === null) {
    return null;
  }
  const eventHoles = getBlockAnalysis(data.template).eventHoles;
  for (let i = 0; i < eventHoles.length; i++) {
    const eventHole = eventHoles[i];
    if (eventHole.name === reactName && data.refs[eventHole.ref] === node) {
      const listener = data.values[eventHole.hole];
      if (listener == null) {
        return null;
      }
      if (typeof listener !== 'function') {
        throw new Error(
          `Expected \`${reactName}\` listener to be a function, instead got a value of \`${typeof listener}\` type.`,
        );
      }
      return listener;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Inline lists
// -----------------------------------------------------------------------------

type BlockElement = {
  type: BlockTemplate,
  key: string,
  props: {v: BlockValues, ...},
  ...
};

function createInlineItem(
  element: BlockElement,
  ownerDocument: Document,
): BlockInstanceData {
  const data = createInstanceData(
    element.type,
    element.props.v,
    ownerDocument,
    element.key,
  );
  const slotContents = data.slotContents;
  if (slotContents !== null) {
    const values = data.values;
    const slots = getBlockAnalysis(data.template).slots;
    // In template order, each before the static node that follows its slot.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const value = values[slot.hole];
      if (!isEmptySlotValue(value)) {
        setSlotContent(
          data,
          i,
          value,
          null,
          slot.nextStaticRef === -1 ? null : data.refs[slot.nextStaticRef],
        );
      }
    }
  }
  return data;
}

function updateInlineItem(data: BlockInstanceData, newValues: BlockValues) {
  const oldValues = data.values;
  if (oldValues === newValues) {
    return;
  }
  commitHoles(data, newValues);
  if (data.slotContents !== null) {
    const slots = getBlockAnalysis(data.template).slots;
    // In template order, so that content is inserted relative to the final
    // content of earlier slots.
    for (let i = 0; i < slots.length; i++) {
      const hole = slots[i].hole;
      if (blockSlotNeedsCommit(oldValues[hole], newValues[hole])) {
        setSlotContent(
          data,
          i,
          newValues[hole],
          oldValues[hole],
          getInlineSlotInsertionPoint(data, i),
        );
      }
    }
  }
}

function mountList(
  parent: Element,
  children: $ReadOnlyArray<BlockElement>,
  before: null | Node,
  fiberItems: null | $ReadOnlyArray<null | Element>,
): Array<BlockInstanceData> {
  const ownerDocument: Document = parent.ownerDocument as any;
  const items: Array<BlockInstanceData> = new Array(children.length);
  for (let i = 0; i < children.length; i++) {
    const item = createOrGetItem(children[i], i, fiberItems, ownerDocument);
    parent.insertBefore(item.root, before);
    items[i] = item;
  }
  return items;
}

// The instance of a new list item: the instance of its fiber, if it has one,
// or a new instance without a fiber.
function createOrGetItem(
  child: BlockElement,
  index: number,
  fiberItems: null | $ReadOnlyArray<null | Element>,
  ownerDocument: Document,
): BlockInstanceData {
  const fiberRoot = fiberItems === null ? null : fiberItems[index];
  return fiberRoot == null
    ? createInlineItem(child, ownerDocument)
    : getBlockInstanceData(fiberRoot);
}

// Whether an existing item is the item of a new child: the same key and
// template, and the same ownership (an item with a fiber is matched by its
// instance).
function isSameItem(
  item: BlockInstanceData,
  child: BlockElement,
  index: number,
  fiberItems: null | $ReadOnlyArray<null | Element>,
): boolean {
  if (item.key !== child.key || item.template !== child.type) {
    return false;
  }
  const fiberRoot = fiberItems === null ? null : fiberItems[index];
  return fiberRoot == null ? !item.ownedByFiber : item.root === fiberRoot;
}

// Updates a matched item. The reconciler updates items with fibers.
function updateItem(item: BlockInstanceData, child: BlockElement): void {
  if (!item.ownedByFiber) {
    updateInlineItem(item, child.props.v);
  }
}

function reconcileList(
  parent: Element,
  oldItems: Array<BlockInstanceData>,
  children: $ReadOnlyArray<BlockElement>,
  // The list `oldItems` were rendered from.
  previousChildren: mixed,
  before: null | Node,
  soleChild: boolean,
  fiberItems: null | $ReadOnlyArray<null | Element>,
): Array<BlockInstanceData> {
  const oldLength = oldItems.length;
  const newLength = children.length;
  if (fiberItems === null && oldLength === newLength) {
    // A list that records which of its items replace items of the list the
    // current items were rendered from only needs those items updated: every
    // other item is the same element, so it is unchanged.
    const changed = getBlockListChanges(children, previousChildren);
    if (changed !== null) {
      let matches = true;
      for (let i = 0; i < changed.length; i++) {
        const index = changed[i];
        if (!isSameItem(oldItems[index], children[index], index, null)) {
          matches = false;
          break;
        }
      }
      if (matches) {
        for (let i = 0; i < changed.length; i++) {
          const index = changed[i];
          updateItem(oldItems[index], children[index]);
        }
        return oldItems;
      }
    }
  }
  if (newLength === 0) {
    if (oldLength > 0) {
      if (soleChild && !oldItems.some(item => item.ownedByFiber)) {
        parent.textContent = '';
      } else {
        removeSlotContent(parent, oldItems);
      }
    }
    return [];
  }
  const ownerDocument: Document = parent.ownerDocument as any;
  const items: Array<BlockInstanceData> = new Array(newLength);

  // Two-ended scan: items with the same key and template at either end of
  // the remaining ranges are updated in place, and an item that moved from one
  // end to the other (as in a swap or a single move) is moved directly.
  let oldStart = 0;
  let oldEnd = oldLength - 1;
  let newStart = 0;
  let newEnd = newLength - 1;
  while (oldStart <= oldEnd && newStart <= newEnd) {
    const oldFirst = oldItems[oldStart];
    const newFirst = children[newStart];
    if (isSameItem(oldFirst, newFirst, newStart, fiberItems)) {
      updateItem(oldFirst, newFirst);
      items[newStart] = oldFirst;
      oldStart++;
      newStart++;
      continue;
    }
    const oldLast = oldItems[oldEnd];
    const newLast = children[newEnd];
    if (isSameItem(oldLast, newLast, newEnd, fiberItems)) {
      updateItem(oldLast, newLast);
      items[newEnd] = oldLast;
      oldEnd--;
      newEnd--;
      continue;
    }
    if (isSameItem(oldFirst, newLast, newEnd, fiberItems)) {
      // Moved from the start to the end of the remaining range: place it
      // before the already final item that follows the range.
      updateItem(oldFirst, newLast);
      parent.insertBefore(
        oldFirst.root,
        newEnd + 1 < newLength ? items[newEnd + 1].root : before,
      );
      items[newEnd] = oldFirst;
      oldStart++;
      newEnd--;
      continue;
    }
    if (isSameItem(oldLast, newFirst, newStart, fiberItems)) {
      // Moved from the end to the start of the remaining range: place it
      // before the first remaining old item.
      updateItem(oldLast, newFirst);
      parent.insertBefore(oldLast.root, oldFirst.root);
      items[newStart] = oldLast;
      oldEnd--;
      newStart++;
      continue;
    }
    break;
  }

  if (oldStart > oldEnd) {
    // Only insertions remain.
    const anchor = newEnd + 1 < newLength ? items[newEnd + 1].root : before;
    for (let i = newStart; i <= newEnd; i++) {
      const item = createOrGetItem(children[i], i, fiberItems, ownerDocument);
      parent.insertBefore(item.root, anchor);
      items[i] = item;
    }
    return items;
  }
  if (newStart > newEnd) {
    // Only removals remain.
    removeItems(parent, oldItems, oldStart, oldEnd);
    return items;
  }

  // Match the remaining new children to old items by key. A key that appears
  // more than once is matched at most once; the remaining duplicates are
  // created and removed like any other unmatched item.
  const oldCount = oldEnd - oldStart + 1;
  const newCount = newEnd - newStart + 1;
  const keyToOldIndex: Map<string, number> = new Map();
  for (let i = oldStart; i <= oldEnd; i++) {
    const key: string = oldItems[i].key as any;
    if (!keyToOldIndex.has(key)) {
      keyToOldIndex.set(key, i);
    }
  }
  // For each new child, 1 + the index of the old item it reuses, or 0.
  const sources = new Int32Array(newCount);
  const oldMatched = new Uint8Array(oldCount);
  let matchedCount = 0;
  let moved = false;
  let lastOldIndex = -1;
  for (let i = newStart; i <= newEnd; i++) {
    const child = children[i];
    const oldIndex = keyToOldIndex.get(child.key);
    if (oldIndex === undefined) {
      continue;
    }
    keyToOldIndex.delete(child.key);
    const item = oldItems[oldIndex];
    if (!isSameItem(item, child, i, fiberItems)) {
      continue;
    }
    oldMatched[oldIndex - oldStart] = 1;
    sources[i - newStart] = oldIndex + 1;
    matchedCount++;
    updateItem(item, child);
    items[i] = item;
    if (oldIndex < lastOldIndex) {
      moved = true;
    } else {
      lastOldIndex = oldIndex;
    }
  }

  if (
    matchedCount === 0 &&
    soleChild &&
    !oldItems.some(item => item.ownedByFiber) &&
    oldStart === 0 &&
    oldEnd === oldLength - 1 &&
    newStart === 0 &&
    newEnd === newLength - 1
  ) {
    // Every item is replaced and the list is its parent's only content.
    parent.textContent = '';
  } else {
    for (let i = 0; i < oldCount; i++) {
      if (oldMatched[i] === 0 && !oldItems[oldStart + i].ownedByFiber) {
        parent.removeChild(oldItems[oldStart + i].root);
      }
    }
  }

  // Insert new items and move reused items that are not in the longest
  // increasing subsequence of old indices, from the end so that the next
  // item is always in its final place.
  if (moved) {
    const stable = longestIncreasingSubsequence(sources);
    let stableIndex = stable.length - 1;
    for (let i = newCount - 1; i >= 0; i--) {
      const position = newStart + i;
      const anchor =
        position + 1 < newLength ? items[position + 1].root : before;
      if (sources[i] === 0) {
        const item = createOrGetItem(
          children[position],
          position,
          fiberItems,
          ownerDocument,
        );
        parent.insertBefore(item.root, anchor);
        items[position] = item;
      } else if (stableIndex < 0 || stable[stableIndex] !== i) {
        parent.insertBefore(items[position].root, anchor);
      } else {
        stableIndex--;
      }
    }
  } else if (matchedCount !== newCount) {
    for (let i = newCount - 1; i >= 0; i--) {
      if (sources[i] === 0) {
        const position = newStart + i;
        const anchor =
          position + 1 < newLength ? items[position + 1].root : before;
        const item = createOrGetItem(
          children[position],
          position,
          fiberItems,
          ownerDocument,
        );
        parent.insertBefore(item.root, anchor);
        items[position] = item;
      }
    }
  }
  return items;
}

// Indices into `sources` of a longest strictly increasing subsequence of its
// non-zero entries, in increasing order.
function longestIncreasingSubsequence(sources: Int32Array): Int32Array {
  const length = sources.length;
  const predecessors = new Int32Array(length);
  // tails[k] is the index of the smallest tail of an increasing subsequence
  // of length k + 1.
  const tails = new Int32Array(length);
  let tailCount = 0;
  for (let i = 0; i < length; i++) {
    const value = sources[i];
    if (value === 0) {
      continue;
    }
    if (tailCount === 0 || sources[tails[tailCount - 1]] < value) {
      predecessors[i] = tailCount > 0 ? tails[tailCount - 1] : -1;
      tails[tailCount++] = i;
      continue;
    }
    let low = 0;
    let high = tailCount - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (sources[tails[middle]] < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    predecessors[i] = low > 0 ? tails[low - 1] : -1;
    tails[low] = i;
  }
  const result = new Int32Array(tailCount);
  let index = tailCount > 0 ? tails[tailCount - 1] : -1;
  for (let k = tailCount - 1; k >= 0; k--) {
    result[k] = index;
    index = predecessors[index];
  }
  return result;
}
