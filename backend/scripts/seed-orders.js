"use strict";

const { Pool } = require("pg");
const { config } = require("../src/config");

const CUSTOMER_NAMES = [
  "Alicia Rivera",
  "Marcus Cole",
  "Priya Shah",
  "Jonah Miles",
  "Nora Patel",
  "Ethan Brooks",
  "Maya Foster",
  "Luca Morris",
  "Avery Collins",
  "Sofia Nguyen",
  "Noah Singh",
  "Mia Chen"
];

const PRODUCT_NAMES = [
  "Mechanical Keyboard",
  "27-inch Monitor",
  "USB-C Dock",
  "Ergonomic Chair",
  "Wireless Mouse",
  "Desk Lamp",
  "Laptop Stand",
  "Noise Cancelling Headphones",
  "Standing Desk",
  "Webcam Pro"
];

const STATUSES = ["pending", "shipped", "delivered"];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomStatus() {
  const value = Math.random();

  if (value < 0.35) {
    return "pending";
  }

  if (value < 0.7) {
    return "shipped";
  }

  return "delivered";
}

function buildTimestampForDay(dayOffset, slotIndex) {
  const date = new Date();

  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - dayOffset);

  const hour = 9 + (slotIndex % 9);
  const minute = (slotIndex * 13) % 60;
  const second = (slotIndex * 17) % 60;

  date.setHours(hour, minute, second, 0);

  return date;
}

function buildOrders(count, daysBack) {
  const totalDays = Math.min(daysBack, Math.max(14, Math.floor(count * 0.75)));

  return Array.from({ length: count }, (_, index) => {
    const dayOffset = totalDays - (index % totalDays);

    return {
      customer_name: `${randomItem(CUSTOMER_NAMES)} ${index + 1}`,
      product_name: randomItem(PRODUCT_NAMES),
      status: randomStatus(),
      updated_at: buildTimestampForDay(dayOffset, index)
    };
  }).sort((left, right) => left.updated_at.getTime() - right.updated_at.getTime());
}

async function main() {
  const pool = new Pool(config.database);
  const client = await pool.connect();

  try {
    const orders = buildOrders(48, 45);

    await client.query("BEGIN");
    await client.query("DELETE FROM orders");

    for (const order of orders) {
      await client.query(
        `INSERT INTO orders (customer_name, product_name, status, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [order.customer_name, order.product_name, order.status, order.updated_at.toISOString()]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${orders.length} orders across ${Math.min(45, Math.max(14, Math.floor(orders.length * 0.75)))} distinct past days.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
