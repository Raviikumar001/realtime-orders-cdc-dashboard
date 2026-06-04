"use strict";

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const { createDbPool } = require("./db");
const { healthRoutes } = require("./routes/health");
const { orderRoutes } = require("./routes/orders");

async function buildApp(config) {
  const app = Fastify({
    logger: true
  });
  const db = createDbPool(config.database);

  await app.register(cors, { origin: true });

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.end();
  });

  await app.register(healthRoutes);
  await app.register(orderRoutes);

  return app;
}

module.exports = { buildApp };
