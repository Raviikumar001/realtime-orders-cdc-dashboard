"use strict";

const VALID_STATUSES = new Set(["pending", "shipped", "delivered"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStatus(status) {
  return VALID_STATUSES.has(status);
}

function parseId(id) {
  const parsed = Number(id);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error("Order id must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function sanitizeOrderInput(body, { partial = false } = {}) {
  const cleaned = {};

  if (Object.prototype.hasOwnProperty.call(body, "customer_name")) {
    if (!isNonEmptyString(body.customer_name)) {
      const error = new Error("customer_name must be a non-empty string");
      error.statusCode = 400;
      throw error;
    }

    cleaned.customer_name = body.customer_name.trim();
  } else if (!partial) {
    const error = new Error("customer_name is required");
    error.statusCode = 400;
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(body, "product_name")) {
    if (!isNonEmptyString(body.product_name)) {
      const error = new Error("product_name must be a non-empty string");
      error.statusCode = 400;
      throw error;
    }

    cleaned.product_name = body.product_name.trim();
  } else if (!partial) {
    const error = new Error("product_name is required");
    error.statusCode = 400;
    throw error;
  }

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    if (!validateStatus(body.status)) {
      const error = new Error("status must be one of: pending, shipped, delivered");
      error.statusCode = 400;
      throw error;
    }

    cleaned.status = body.status;
  } else if (!partial) {
    const error = new Error("status is required");
    error.statusCode = 400;
    throw error;
  }

  return cleaned;
}

async function orderRoutes(fastify) {
  fastify.get("/orders", async () => {
    const result = await fastify.db.query("SELECT * FROM orders ORDER BY id ASC");
    return result.rows;
  });

  fastify.post("/orders", async (request, reply) => {
    const order = sanitizeOrderInput(request.body || {});
    const result = await fastify.db.query(
      `INSERT INTO orders (customer_name, product_name, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [order.customer_name, order.product_name, order.status]
    );

    reply.code(201);
    return result.rows[0];
  });

  fastify.patch("/orders/:id", async (request) => {
    const id = parseId(request.params.id);
    const order = sanitizeOrderInput(request.body || {}, { partial: true });
    const entries = Object.entries(order);

    if (entries.length === 0) {
      const error = new Error("Provide at least one field to update");
      error.statusCode = 400;
      throw error;
    }

    const values = [];
    const assignments = entries.map(([key, value], index) => {
      values.push(value);
      return `${key} = $${index + 1}`;
    });

    values.push(id);

    const result = await fastify.db.query(
      `UPDATE orders
       SET ${assignments.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    return result.rows[0];
  });

  fastify.delete("/orders/:id", async (request, reply) => {
    const id = parseId(request.params.id);
    const result = await fastify.db.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      const error = new Error("Order not found");
      error.statusCode = 404;
      throw error;
    }

    reply.code(204);
    return null;
  });
}

module.exports = { orderRoutes };
