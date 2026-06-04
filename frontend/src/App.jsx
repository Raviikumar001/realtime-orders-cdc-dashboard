import { Activity, Boxes, CircleDashed, PackageCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000";

const STATUS_META = {
  pending: { label: "Pending", icon: CircleDashed },
  shipped: { label: "Shipped", icon: Truck },
  delivered: { label: "Delivered", icon: PackageCheck }
};

function sortOrders(nextOrders) {
  return [...nextOrders].sort((left, right) => Number(left.id) - Number(right.id));
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function buildActivityMessage(event) {
  if (!event?.order) {
    return "Received update";
  }

  if (event.operation === "INSERT") {
    return `Order #${event.order.id} created for ${event.order.customer_name}`;
  }

  if (event.operation === "UPDATE") {
    return `Order #${event.order.id} moved to ${event.order.status}`;
  }

  if (event.operation === "DELETE") {
    return `Order #${event.order.id} deleted`;
  }

  return `Order #${event.order.id} changed`;
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [activity, setActivity] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [lastUpdateAt, setLastUpdateAt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [mutationMessage, setMutationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [formState, setFormState] = useState({
    customer_name: "",
    product_name: "",
    status: "pending"
  });
  const [simulatorState, setSimulatorState] = useState({
    running: false,
    tickCount: 0,
    lastAction: null,
    lastError: null,
    nextDelayMs: null
  });
  const [isSimulatorPending, setIsSimulatorPending] = useState(false);

  async function request(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json"
      },
      ...options
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({ message: "Request failed" }));
      throw new Error(errorPayload.error || errorPayload.message || "Request failed");
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  useEffect(() => {
    let active = true;

    async function loadOrders() {
      try {
        const response = await fetch(`${API_BASE_URL}/orders`);

        if (!response.ok) {
          throw new Error("Failed to fetch orders");
        }

        const nextOrders = await response.json();

        if (!active) {
          return;
        }

        setOrders(sortOrders(nextOrders));
        setErrorMessage("");
      } catch (error) {
        if (!active) {
          return;
        }

        setErrorMessage(error.message);
      }
    }

    loadOrders();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSimulatorState() {
      try {
        const nextState = await request("/simulator");

        if (!active) {
          return;
        }

        setSimulatorState(nextState);
      } catch (error) {
        if (!active) {
          return;
        }

        setMutationMessage(error.message);
      }
    }

    loadSimulatorState();
    const interval = setInterval(loadSimulatorState, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const stream = new EventSource(`${API_BASE_URL}/events`);

    function recordActivity(entry) {
      setActivity((current) => [entry, ...current].slice(0, 12));
    }

    stream.addEventListener("open", () => {
      setConnectionState("live");
      setErrorMessage("");
    });

    stream.addEventListener("connected", (event) => {
      const payload = JSON.parse(event.data);
      setConnectionState("live");
      setLastUpdateAt(payload.timestamp);
      recordActivity({
        id: `connected-${payload.timestamp}`,
        label: "Live stream connected",
        timestamp: payload.timestamp
      });
    });

    stream.addEventListener("snapshot", (event) => {
      const payload = JSON.parse(event.data);
      setOrders(sortOrders(payload));
      setLastUpdateAt(new Date().toISOString());
    });

    stream.addEventListener("order.changed", (event) => {
      const payload = JSON.parse(event.data);

      setOrders((current) => {
        if (payload.operation === "DELETE") {
          return current.filter((order) => Number(order.id) !== Number(payload.order.id));
        }

        const next = current.filter((order) => Number(order.id) !== Number(payload.order.id));
        next.push(payload.order);
        return sortOrders(next);
      });

      setLastUpdateAt(payload.meta.receivedAt);
      recordActivity({
        id: `${payload.meta.lsn}-${payload.order.id}`,
        label: buildActivityMessage(payload),
        timestamp: payload.meta.receivedAt
      });
    });

    stream.addEventListener("error", () => {
      setConnectionState("reconnecting");
      setErrorMessage("Live stream interrupted. Waiting for reconnection.");
    });

    return () => {
      stream.close();
    };
  }, []);

  const totalOrders = orders.length;
  const pendingOrders = orders.filter((order) => order.status === "pending").length;
  const shippedOrders = orders.filter((order) => order.status === "shipped").length;
  const deliveredOrders = orders.filter((order) => order.status === "delivered").length;

  const chartData = [
    { name: "Pending", value: pendingOrders },
    { name: "Shipped", value: shippedOrders },
    { name: "Delivered", value: deliveredOrders }
  ];

  const metricCards = [
    {
      title: "Total Orders",
      value: totalOrders,
      subtitle: "Current tracked orders",
      icon: Boxes,
      tone: "total"
    },
    {
      title: "Pending",
      value: pendingOrders,
      subtitle: "Awaiting fulfillment",
      icon: STATUS_META.pending.icon,
      tone: "pending"
    },
    {
      title: "Shipped",
      value: shippedOrders,
      subtitle: "Currently in transit",
      icon: STATUS_META.shipped.icon,
      tone: "shipped"
    },
    {
      title: "Delivered",
      value: deliveredOrders,
      subtitle: "Completed orders",
      icon: STATUS_META.delivered.icon,
      tone: "delivered"
    }
  ];

  async function handleCreateOrder(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMutationMessage("");

    try {
      await request("/orders", {
        method: "POST",
        body: JSON.stringify(formState)
      });

      setFormState({
        customer_name: "",
        product_name: "",
        status: "pending"
      });
      setMutationMessage("Order submitted. Waiting for CDC stream confirmation.");
    } catch (error) {
      setMutationMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(orderId, status) {
    setActiveOrderId(orderId);
    setMutationMessage("");

    try {
      await request(`/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setMutationMessage(`Order #${orderId} update submitted. Waiting for CDC confirmation.`);
    } catch (error) {
      setMutationMessage(error.message);
    } finally {
      setActiveOrderId(null);
    }
  }

  async function handleDeleteOrder(orderId) {
    setActiveOrderId(orderId);
    setMutationMessage("");

    try {
      await request(`/orders/${orderId}`, {
        method: "DELETE"
      });
      setMutationMessage(`Delete request for order #${orderId} submitted. Waiting for CDC confirmation.`);
    } catch (error) {
      setMutationMessage(error.message);
    } finally {
      setActiveOrderId(null);
    }
  }

  async function handleSimulator(action) {
    setIsSimulatorPending(true);
    setMutationMessage("");

    try {
      const nextState = await request(`/simulator/${action}`, {
        method: "POST"
      });
      setSimulatorState(nextState);
      setMutationMessage(
        action === "start"
          ? "Simulator started. New writes will flow back through CDC and SSE."
          : "Simulator stopped."
      );
    } catch (error) {
      setMutationMessage(error.message);
    } finally {
      setIsSimulatorPending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">PostgreSQL WAL / CDC / SSE</p>
          <h1>Real-Time Orders Monitoring Dashboard</h1>
          <p className="hero-copy">
            Browser updates are driven by committed WAL changes, streamed through the Fastify backend,
            and rendered live without polling.
          </p>
        </div>

        <div className="hero-status-group">
          <div className={`status-pill status-${connectionState}`}>
            <span className="status-dot" />
            <span>{connectionState === "live" ? "Live stream connected" : "Reconnecting"}</span>
          </div>
          <div className="status-note">Last update: {formatTimestamp(lastUpdateAt)}</div>
        </div>
      </section>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {mutationMessage ? <div className="mutation-banner">{mutationMessage}</div> : null}

      <section className="metrics-grid">
        {metricCards.map((card) => {
          const Icon = card.icon;

          return (
            <article key={card.title} className={`metric-card metric-${card.tone}`}>
              <div>
                <p className="metric-title">{card.title}</p>
                <p className="metric-value">{card.value}</p>
                <p className="metric-subtitle">{card.subtitle}</p>
              </div>
              <div className="metric-icon-wrap">
                <Icon size={22} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel panel-controls">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Manual write path</p>
            <h2>Create an order through the API</h2>
          </div>
          <div className="status-note">Visible updates still arrive back through CDC and SSE</div>
        </div>

        <form className="create-form" onSubmit={handleCreateOrder}>
          <label>
            <span>Customer name</span>
            <input
              value={formState.customer_name}
              onChange={(event) => {
                setFormState((current) => ({ ...current, customer_name: event.target.value }));
              }}
              placeholder="Alicia Rivera"
              required
            />
          </label>
          <label>
            <span>Product name</span>
            <input
              value={formState.product_name}
              onChange={(event) => {
                setFormState((current) => ({ ...current, product_name: event.target.value }));
              }}
              placeholder="Ergonomic Chair"
              required
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={formState.status}
              onChange={(event) => {
                setFormState((current) => ({ ...current, status: event.target.value }));
              }}
            >
              <option value="pending">pending</option>
              <option value="shipped">shipped</option>
              <option value="delivered">delivered</option>
            </select>
          </label>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Create order"}
          </button>
        </form>

        <div className="simulator-row">
          <div>
            <p className="panel-kicker">Auto simulator</p>
            <h2>{simulatorState.running ? "Simulator is running" : "Simulator is idle"}</h2>
            <p className="status-note">
              Ticks: {simulatorState.tickCount} | Next delay: {simulatorState.nextDelayMs ?? "-"}ms
            </p>
            <p className="status-note">
              Last action: {simulatorState.lastAction ? `${simulatorState.lastAction.type} order #${simulatorState.lastAction.orderId}` : "No simulated writes yet"}
            </p>
            {simulatorState.lastError ? (
              <p className="simulator-error">Last simulator error: {simulatorState.lastError}</p>
            ) : null}
          </div>

          <div className="simulator-actions">
            <button
              type="button"
              disabled={isSimulatorPending || simulatorState.running}
              onClick={() => {
                handleSimulator("start");
              }}
            >
              {isSimulatorPending && !simulatorState.running ? "Starting..." : "Start simulator"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={isSimulatorPending || !simulatorState.running}
              onClick={() => {
                handleSimulator("stop");
              }}
            >
              {isSimulatorPending && simulatorState.running ? "Stopping..." : "Stop simulator"}
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-chart">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Status distribution</p>
              <h2>Order flow by stage</h2>
            </div>
          </div>

          <div className="chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap={18}>
                <CartesianGrid vertical={false} stroke="rgba(148, 163, 184, 0.18)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(96, 165, 250, 0.08)" }} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#7c9cff" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel panel-feed">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Live feed</p>
              <h2>Activity stream</h2>
            </div>
            <Activity size={18} className="panel-icon" />
          </div>

          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-state">Waiting for the next CDC event...</div>
            ) : (
              activity.map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className="activity-marker" />
                  <div>
                    <div className="activity-label">{entry.label}</div>
                    <div className="activity-time">{formatTimestamp(entry.timestamp)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="panel panel-table">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Live inventory</p>
            <h2>Orders table</h2>
          </div>
          <div className="status-note">Rows update from the SSE stream automatically</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-row">
                    No orders to display yet.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.customer_name}</td>
                    <td>{order.product_name}</td>
                    <td>
                      <span className={`table-badge badge-${order.status}`}>{order.status}</span>
                    </td>
                    <td>{formatTimestamp(order.updated_at)}</td>
                    <td>
                      <div className="action-row">
                        <select
                          value={order.status}
                          disabled={activeOrderId === Number(order.id)}
                          onChange={(event) => {
                            handleStatusChange(order.id, event.target.value);
                          }}
                        >
                          <option value="pending">pending</option>
                          <option value="shipped">shipped</option>
                          <option value="delivered">delivered</option>
                        </select>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={activeOrderId === Number(order.id)}
                          onClick={() => {
                            handleDeleteOrder(order.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
