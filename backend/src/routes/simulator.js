"use strict";

async function simulatorRoutes(fastify) {
  fastify.get("/simulator", async () => {
    return fastify.simulator.getState();
  });

  fastify.post("/simulator/start", async () => {
    return fastify.simulator.start();
  });

  fastify.post("/simulator/stop", async () => {
    return fastify.simulator.stop();
  });
}

module.exports = { simulatorRoutes };
