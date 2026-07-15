"use strict";

const sodium = require("sodium-javascript");

// WDK currently imports this as an ESM named export. Assigning it explicitly
// keeps Node's CommonJS named-export detection compatible while retaining the
// pure JavaScript implementation used by sodium-javascript.
exports.sodium_memzero = sodium.sodium_memzero;
