CREATE ROLE orders_app WITH LOGIN PASSWORD 'orders_app';
CREATE ROLE orders_replica WITH LOGIN REPLICATION PASSWORD 'orders_replica';

GRANT CONNECT ON DATABASE orders_demo TO orders_app;
GRANT CONNECT ON DATABASE orders_demo TO orders_replica;

\connect orders_demo;

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders REPLICA IDENTITY DEFAULT;

GRANT USAGE ON SCHEMA public TO orders_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE orders TO orders_app;
GRANT USAGE, SELECT ON SEQUENCE orders_id_seq TO orders_app;

INSERT INTO orders (customer_name, product_name, status)
VALUES
  ('Alice Carter', 'Mechanical Keyboard', 'pending'),
  ('Noah Singh', '27-inch Monitor', 'shipped'),
  ('Mia Chen', 'USB-C Dock', 'delivered')
ON CONFLICT DO NOTHING;

DROP PUBLICATION IF EXISTS orders_publication;
CREATE PUBLICATION orders_publication FOR TABLE orders;
