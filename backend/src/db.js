"use strict";

const { Pool } = require("pg");

function createDbPool(options) {
  return new Pool(options);
}

module.exports = { createDbPool };
