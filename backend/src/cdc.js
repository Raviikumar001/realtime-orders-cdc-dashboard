"use strict";

const { Client } = require("pg");
const {
  LogicalReplicationService,
  PgoutputPlugin
} = require("pg-logical-replication");

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class OrdersCdcManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.service = null;
    this.stopped = false;
    this.loopPromise = null;
    this.state = {
      connected: false,
      slotName: config.slotName,
      publicationName: config.publicationName,
      lastLsn: null,
      lastEvent: null,
      restartCount: 0,
      lastError: null
    };
  }

  getState() {
    return { ...this.state };
  }

  async ensureSlot() {
    const client = new Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      application_name: "orders-cdc-slot-bootstrap"
    });

    await client.connect();

    try {
      const existing = await client.query(
        "SELECT slot_name FROM pg_replication_slots WHERE slot_name = $1",
        [this.config.slotName]
      );

      if (existing.rows.length === 0) {
        await client.query(
          "SELECT * FROM pg_create_logical_replication_slot($1, 'pgoutput')",
          [this.config.slotName]
        );
      }
    } finally {
      await client.end();
    }
  }

  async start() {
    await this.ensureSlot();

    this.stopped = false;
    this.loopPromise = this.runLoop();
  }

  async stop() {
    this.stopped = true;

    if (this.service) {
      await this.service.destroy();
      this.service = null;
    }

    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
  }

  async runLoop() {
    while (!this.stopped) {
      const service = new LogicalReplicationService(
        {
          host: this.config.host,
          port: this.config.port,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
          application_name: "orders-cdc-consumer"
        },
        {
          acknowledge: {
            auto: true,
            timeoutSeconds: 10
          },
          flowControl: {
            enabled: true
          }
        }
      );

      const plugin = new PgoutputPlugin({
        protoVersion: 1,
        publicationNames: [this.config.publicationName]
      });

      this.service = service;
      this.bindServiceEvents(service);

      try {
        await service.subscribe(
          plugin,
          this.config.slotName,
          this.state.lastLsn || undefined
        );
      } catch (error) {
        if (!this.stopped) {
          this.state.lastError = error.message;
          this.logger.error({ err: error }, "CDC consumer stopped unexpectedly");
        }
      } finally {
        this.state.connected = false;
        this.service = null;
      }

      if (!this.stopped) {
        this.state.restartCount += 1;
        await sleep(1000);
      }
    }
  }

  bindServiceEvents(service) {
    service.on("start", () => {
      this.state.connected = true;
      this.state.lastError = null;
      this.logger.info(
        {
          slotName: this.config.slotName,
          publicationName: this.config.publicationName
        },
        "CDC consumer started"
      );
    });

    service.on("error", (error) => {
      this.state.lastError = error.message;
      this.logger.error({ err: error }, "CDC consumer error");
    });

    service.on("data", async (lsn, message) => {
      this.state.lastLsn = lsn;

      const event = normalizeOrdersEvent(message, lsn);

      if (!event) {
        return;
      }

      this.state.lastEvent = event;
      this.logger.info({ cdcEvent: event }, "Received orders CDC event");
    });
  }
}

function normalizeOrdersEvent(message, lsn) {
  if (!message || !message.tag) {
    return null;
  }

  if (message.tag === "insert" && isOrdersRelation(message.relation)) {
    return buildEvent("INSERT", message.new, lsn);
  }

  if (message.tag === "update" && isOrdersRelation(message.relation)) {
    return buildEvent("UPDATE", message.new, lsn);
  }

  if (message.tag === "delete" && isOrdersRelation(message.relation)) {
    return buildEvent("DELETE", message.old || message.key, lsn);
  }

  return null;
}

function isOrdersRelation(relation) {
  return relation && relation.schema === "public" && relation.name === "orders";
}

function buildEvent(operation, order, lsn) {
  return {
    type: "order.changed",
    operation,
    order,
    meta: {
      source: "cdc",
      lsn,
      receivedAt: new Date().toISOString()
    }
  };
}

module.exports = { OrdersCdcManager };
