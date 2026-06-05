"use strict";

const Fastify = require("fastify");
const cors = require("@fastify/cors");
const fastifySse = require("@fastify/sse");
const { OrdersCdcManager } = require("./cdc");
const { createDbPool } = require("./db");
const { eventRoutes } = require("./routes/events");
const { healthRoutes } = require("./routes/health");
const { orderRoutes } = require("./routes/orders");
const { simulatorRoutes } = require("./routes/simulator");
const { OrderSimulator } = require("./simulator");
const { SseHub } = require("./sse");

async function buildApp(config) {
  const app = Fastify({
    logger: true
  });
  const db = createDbPool(config.database);
  const cdc = new OrdersCdcManager(config.replication, app.log);
  const sseHub = new SseHub(app.log);
  const simulator = new OrderSimulator(db, app.log);

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  });
  await app.register(fastifySse);

  app.decorate("db", db);
  app.decorate("cdc", cdc);
  app.decorate("sseHub", sseHub);
  app.decorate("simulator", simulator);

  app.addHook("onReady", async () => {
    cdc.subscribe(async (event) => {
      await sseHub.broadcast("order.changed", event);
    });

    await cdc.start();
  });

  app.addHook("onClose", async () => {
    await simulator.stop();
    await cdc.stop();
    await db.end();
  });

  await app.register(eventRoutes);
  await app.register(healthRoutes);
  await app.register(orderRoutes);
  await app.register(simulatorRoutes);

  return app;
}

module.exports = { buildApp };
