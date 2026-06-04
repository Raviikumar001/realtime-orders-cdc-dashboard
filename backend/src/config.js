"use strict";

function readNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: readNumber(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",
  database: {
    host: process.env.DB_HOST || "localhost",
    port: readNumber(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || "orders_demo",
    user: process.env.DB_USER || "orders_app",
    password: process.env.DB_PASSWORD || "orders_app"
  }
};

module.exports = { config };
