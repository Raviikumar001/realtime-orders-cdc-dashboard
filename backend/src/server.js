"use strict";

const { buildApp } = require("./app");
const { config } = require("./config");

async function start() {
  const app = await buildApp(config);

  await app.listen({
    host: config.host,
    port: config.port
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
