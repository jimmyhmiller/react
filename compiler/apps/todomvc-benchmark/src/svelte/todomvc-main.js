/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {mount} from 'svelte';
import TodoApp from './TodoApp.svelte';

mount(TodoApp, {target: document.getElementById('root')});
