"use strict";

const CUSTOMER_NAMES = [
  "Avery Collins",
  "Luca Morris",
  "Maya Foster",
  "Jonah Price",
  "Nina Cooper",
  "Owen Brooks",
  "Sofia Nguyen",
  "Elias Turner"
];

const PRODUCT_NAMES = [
  "Standing Desk",
  "Wireless Mouse",
  "Mechanical Keyboard",
  "USB-C Dock",
  "Desk Lamp",
  "Laptop Stand",
  "27-inch Monitor",
  "Noise Cancelling Headphones"
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class OrderSimulator {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.running = false;
    this.timeout = null;
    this.intervalRange = { min: 500, max: 500 };
    this.state = {
      running: false,
      tickCount: 0,
      lastAction: null,
      lastError: null,
      nextDelayMs: null
    };
  }

  getState() {
    return {
      ...this.state,
      intervalRange: { ...this.intervalRange }
    };
  }

  async start() {
    if (this.running) {
      return this.getState();
    }

    this.running = true;
    this.state.running = true;
    this.state.lastError = null;
    this.scheduleNextTick();
    this.logger.info("Order simulator started");

    return this.getState();
  }

  async stop() {
    this.running = false;
    this.state.running = false;
    this.state.nextDelayMs = null;

    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    this.logger.info("Order simulator stopped");

    return this.getState();
  }

  scheduleNextTick() {
    if (!this.running) {
      return;
    }

    const delay = randomDelay(this.intervalRange.min, this.intervalRange.max);
    this.state.nextDelayMs = delay;

    this.timeout = setTimeout(async () => {
      await this.tick();
      this.scheduleNextTick();
    }, delay);
  }

  async tick() {
    try {
      const action = await this.pickAction();
      this.state.tickCount += 1;
      this.state.lastAction = {
        ...action,
        occurredAt: new Date().toISOString()
      };
      this.state.lastError = null;
      this.logger.info({ simulatorAction: this.state.lastAction }, "Simulator executed order action");
    } catch (error) {
      this.state.lastError = error.message;
      this.logger.error({ err: error }, "Simulator failed to execute action");
    }
  }

  async pickAction() {
    const { rows } = await this.db.query("SELECT * FROM orders ORDER BY id ASC");

    if (rows.length === 0) {
      return this.createOrder();
    }

    const randomValue = Math.random();

    if (randomValue < 0.4) {
      return this.createOrder();
    }

    if (randomValue < 0.85) {
      return this.advanceOrder(rows);
    }

    return this.deleteDeliveredOrder(rows);
  }

  async createOrder() {
    const customerName = randomItem(CUSTOMER_NAMES);
    const productName = randomItem(PRODUCT_NAMES);
    const { rows } = await this.db.query(
      `INSERT INTO orders (customer_name, product_name, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [customerName, productName]
    );

    return {
      type: "create",
      orderId: rows[0].id,
      status: rows[0].status
    };
  }

  async advanceOrder(orders) {
    const candidates = orders.filter((order) => order.status !== "delivered");

    if (candidates.length === 0) {
      return this.deleteDeliveredOrder(orders);
    }

    const order = randomItem(candidates);
    const nextStatus = order.status === "pending" ? "shipped" : "delivered";

    const { rows } = await this.db.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, order.id]
    );

    return {
      type: "advance",
      orderId: rows[0].id,
      status: rows[0].status
    };
  }

  async deleteDeliveredOrder(orders) {
    const delivered = orders.filter((order) => order.status === "delivered");

    if (delivered.length === 0) {
      return this.advanceOrder(orders);
    }

    const order = randomItem(delivered);

    await this.db.query("DELETE FROM orders WHERE id = $1", [order.id]);

    return {
      type: "delete",
      orderId: order.id,
      status: order.status
    };
  }
}

module.exports = { OrderSimulator };
