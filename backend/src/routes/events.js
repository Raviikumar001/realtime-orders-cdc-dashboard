"use strict";

async function eventRoutes(fastify) {
  fastify.get("/events", { sse: true }, async (_request, reply) => {
    fastify.sseHub.addClient(reply);
    reply.sse.keepAlive();

    await fastify.sseHub.replaySince(reply, reply.sse.lastEventId);

    const ordersResult = await fastify.db.query("SELECT * FROM orders ORDER BY id ASC");

    await reply.sse.send({
      event: "connected",
      data: {
        ok: true,
        timestamp: new Date().toISOString()
      }
    });

    await reply.sse.send({
      event: "snapshot",
      data: ordersResult.rows
    });

    reply.sse.onClose(() => {
      fastify.sseHub.removeClient(reply);
    });
  });
}

module.exports = { eventRoutes };
