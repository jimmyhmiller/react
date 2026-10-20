/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';
const fs = require('node:fs');
const {createFromNodeStream} = require('react-server-dom-webpack/client.node');
const {renderToStaticMarkup} = require('react-dom/server');
(async () => {
  const model = await createFromNodeStream(
    fs.createReadStream(process.argv[2]),
    {
      moduleMap: {},
      serverModuleMap: {},
      moduleLoading: null,
    }
  );
  process.stdout.write(JSON.stringify({html: renderToStaticMarkup(model)}));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
