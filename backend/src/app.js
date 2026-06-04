"use strict";

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { OrdersCdcManager } = require("./cdc");
const { createDbPool } = require("./db");
const { healthRoutes } = require("./routes/health");
const { orderRoutes } = require("./routes/orders");

async function buildApp(config) {
  const app = Fastify({
    logger: true
  });
  const db = createDbPool(config.database);
  const cdc = new OrdersCdcManager(config.replication, app.log);

  await app.register(cors, { origin: true });

  app.decorate("db", db);
  app.decorate("cdc", cdc);

  app.addHook("onReady", async () => {
    await cdc.start();
  });

  app.addHook("onClose", async () => {
    await cdc.stop();
    await db.end();
  });

  await app.register(healthRoutes);
  await app.register(orderRoutes);

  return app;
}

module.exports = { buildApp };
