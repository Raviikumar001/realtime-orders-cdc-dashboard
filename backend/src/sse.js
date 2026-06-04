"use strict";

class SseHub {
  constructor(logger) {
    this.logger = logger;
    this.clients = new Set();
    this.history = [];
    this.maxHistory = 100;
    this.nextEventId = 1;
  }

  addClient(reply) {
    this.clients.add(reply);
  }

  removeClient(reply) {
    this.clients.delete(reply);
  }

  getState() {
    return {
      connectedClients: this.clients.size,
      bufferedEvents: this.history.length
    };
  }

  async replaySince(reply, lastEventId) {
    if (!lastEventId) {
      return;
    }

    const lastSeenId = Number(lastEventId);

    if (!Number.isInteger(lastSeenId)) {
      return;
    }

    for (const message of this.history) {
      if (Number(message.id) > lastSeenId) {
        await reply.sse.send(message);
      }
    }
  }

  async broadcast(event, data) {
    const message = {
      id: String(this.nextEventId++),
      event,
      data
    };

    this.history.push(message);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const disconnectedClients = [];

    for (const reply of this.clients) {
      if (!reply.sse.isConnected) {
        disconnectedClients.push(reply);
        continue;
      }

      try {
        await reply.sse.send(message);
      } catch (error) {
        disconnectedClients.push(reply);
        this.logger.warn({ err: error }, "Failed to send SSE event to client");
      }
    }

    for (const reply of disconnectedClients) {
      this.removeClient(reply);
    }

    return message;
  }
}

module.exports = { SseHub };
