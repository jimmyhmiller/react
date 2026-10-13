/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {createRoot} from 'react-dom/client';
import ListenersApp from './ListenersApp.compiled.js';

createRoot(document.getElementById('root')).render(<ListenersApp />);
