"use strict";

async function healthRoutes(fastify) {
  fastify.get("/health", async () => {
    await fastify.db.query("SELECT 1");

    return {
      ok: true,
      database: "reachable",
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = { healthRoutes };
