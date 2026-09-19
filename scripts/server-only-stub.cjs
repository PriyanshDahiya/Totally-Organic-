/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload file */
// Lets scripts import server-only modules outside Next (which would otherwise
// throw without the react-server condition). Preload with --require.
const Module = require("node:module");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return require.resolve("./server-only-noop.cjs");
  return resolve.call(this, request, ...rest);
};
