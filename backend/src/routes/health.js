"use strict";

async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    await fastify.db.query("SELECT 1");

    return {
      ok: true,
      database: "reachable",
      cdc: fastify.cdc.getState(),
      simulator: fastify.simulator.getState(),
      sse: fastify.sseHub.getState(),
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = { healthRoutes };
