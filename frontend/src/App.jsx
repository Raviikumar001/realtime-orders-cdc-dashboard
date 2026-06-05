import {
  Boxes,
  CircleDashed,
  PackageCheck,
  Pause,
  Play,
  Trash2,
  Truck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000";

const STATUS_OPTIONS = ["pending", "shipped", "delivered"];

const STATUS_META = {
  pending: {
    label: "Pending",
    icon: CircleDashed,
    badgeClassName: "border-yellow-500/20 bg-yellow-500/10 text-yellow-200"
  },
  shipped: {
    label: "Shipped",
    icon: Truck,
    badgeClassName: "border-blue-500/20 bg-blue-500/10 text-blue-200"
  },
  delivered: {
    label: "Delivered",
    icon: PackageCheck,
    badgeClassName: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
  }
};

const STATUS_CHART_CONFIG = {
  liveOrders: {
    label: "Live orders",
    color: "var(--chart-1)"
  },
  changes: {
    label: "Changes",
    color: "var(--chart-2)"
  }
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

function formatChartLabel(value) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function buildChartEntry(timestamp, liveOrders, changes) {
  return {
    timestamp,
    label: formatChartLabel(timestamp),
    liveOrders,
    changes
  };
}

function MetricCard({ title, subtitle, value, icon: Icon, badgeClassName }) {
  return (
    <Card className="gap-2 rounded-2xl border-white/10 bg-card/80 py-4 shadow-none">
      <CardHeader className="px-5 pb-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardDescription>{title}</CardDescription>
            <CardTitle className="mt-1.5 text-3xl tracking-tight">{value}</CardTitle>
          </div>
          <div className={cn("rounded-full border p-2.5", badgeClassName)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pt-0 text-sm text-muted-foreground">{subtitle}</CardContent>
    </Card>
  );
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [eventSeries, setEventSeries] = useState([]);
  const [chartRange, setChartRange] = useState("14");
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

    stream.addEventListener("open", () => {
      setErrorMessage("");
    });

    stream.addEventListener("connected", (event) => {
      JSON.parse(event.data);
    });

    stream.addEventListener("snapshot", (event) => {
      const payload = JSON.parse(event.data);
      const nextOrders = sortOrders(payload);
      setOrders(nextOrders);

      if (nextOrders.length > 0) {
        setEventSeries([
          buildChartEntry(nextOrders[nextOrders.length - 1].updated_at, nextOrders.length, nextOrders.length)
        ]);
      }
    });

    stream.addEventListener("order.changed", (event) => {
      const payload = JSON.parse(event.data);

      setOrders((current) => {
        let nextOrders;

        if (payload.operation === "DELETE") {
          nextOrders = current.filter((order) => Number(order.id) !== Number(payload.order.id));
        } else {
          nextOrders = current.filter((order) => Number(order.id) !== Number(payload.order.id));
          nextOrders.push(payload.order);
          nextOrders = sortOrders(nextOrders);
        }

        setEventSeries((series) => {
          const nextLabel = formatChartLabel(payload.meta.receivedAt);
          const nextSeries = [...series];

          if (nextSeries.length > 0 && nextSeries[nextSeries.length - 1].label === nextLabel) {
            const previous = nextSeries[nextSeries.length - 1];
            nextSeries[nextSeries.length - 1] = {
              ...previous,
              timestamp: payload.meta.receivedAt,
              liveOrders: nextOrders.length,
              changes: previous.changes + 1
            };
          } else {
            nextSeries.push(buildChartEntry(payload.meta.receivedAt, nextOrders.length, 1));
          }

          return nextSeries.slice(-20);
        });

        return nextOrders;
      });
    });

    stream.addEventListener("error", () => {
      setErrorMessage("Live stream interrupted. Waiting for reconnection.");
    });

    return () => {
      stream.close();
    };
  }, []);

  const totals = useMemo(() => {
    const pending = orders.filter((order) => order.status === "pending").length;
    const shipped = orders.filter((order) => order.status === "shipped").length;
    const delivered = orders.filter((order) => order.status === "delivered").length;

    return {
      total: orders.length,
      pending,
      shipped,
      delivered
    };
  }, [orders]);

  const chartData = useMemo(
    () =>
      eventSeries.length > 0
        ? eventSeries.slice(-Number(chartRange))
        : [buildChartEntry(new Date().toISOString(), totals.total, 0)],
    [chartRange, eventSeries, totals.total]
  );

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

  async function handleDeleteOrder(orderId) {
    setActiveOrderId(orderId);
    setMutationMessage("");

    try {
      await request(`/orders/${orderId}`, {
        method: "DELETE"
      });
      setOrders((current) => current.filter((order) => Number(order.id) !== Number(orderId)));
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
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        {errorMessage ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        {mutationMessage ? (
          <div className="rounded-2xl border border-white/10 bg-card/70 px-4 py-3 text-sm text-muted-foreground">
            {mutationMessage}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total Orders"
            subtitle="All rows currently visible in the stream"
            value={totals.total}
            icon={Boxes}
            badgeClassName="border-white/10 bg-white/5 text-foreground"
          />
          <MetricCard
            title="Pending"
            subtitle="Awaiting shipment"
            value={totals.pending}
            icon={CircleDashed}
            badgeClassName={STATUS_META.pending.badgeClassName}
          />
          <MetricCard
            title="Shipped"
            subtitle="In transit right now"
            value={totals.shipped}
            icon={Truck}
            badgeClassName={STATUS_META.shipped.badgeClassName}
          />
          <MetricCard
            title="Delivered"
            subtitle="Completed workflow"
            value={totals.delivered}
            icon={PackageCheck}
            badgeClassName={STATUS_META.delivered.badgeClassName}
          />
        </section>

        <section className="space-y-6">
          <Card className="overflow-hidden rounded-[28px] border-white/10 bg-card/80 shadow-none">
            <CardHeader className="border-b border-white/10 px-6 pb-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardDescription>Live order activity</CardDescription>
                  <CardTitle className="mt-2 text-2xl tracking-tight">Area Chart - Interactive</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Recent order changes and live order volume from the replication stream.
                  </p>
                </div>
                <div className="w-full md:w-[180px]">
                  <Select value={chartRange} onValueChange={setChartRange}>
                    <SelectTrigger className="w-full rounded-xl border-white/10 bg-background/60">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 points</SelectItem>
                      <SelectItem value="14">Last 14 points</SelectItem>
                      <SelectItem value="20">Last 20 points</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-6 py-6">
              <ChartContainer config={STATUS_CHART_CONFIG} className="min-h-[220px] w-full">
                <AreaChart accessibilityLayer data={chartData} margin={{ left: 8, right: 8, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <defs>
                    <linearGradient id="fillLiveOrders" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-liveOrders)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--color-liveOrders)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                  <Area
                    type="monotone"
                    dataKey="liveOrders"
                    fill="url(#fillLiveOrders)"
                    stroke="var(--color-liveOrders)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="changes"
                    stroke="var(--color-changes)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/10 bg-card/80 shadow-none">
            <CardHeader className="px-6">
              <CardDescription>Manual write path</CardDescription>
              <CardTitle className="text-2xl tracking-tight">Create and control orders</CardTitle>
              <CardDescription>
                Writes go through the REST API, then the visible state comes back through CDC and
                SSE.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 px-6">
                <form className="grid gap-4 md:grid-cols-[1fr_1fr_180px_auto]" onSubmit={handleCreateOrder}>
                  <div className="grid gap-2">
                    <Label htmlFor="customer_name">Customer name</Label>
                    <Input
                      id="customer_name"
                      value={formState.customer_name}
                      onChange={(event) => {
                        setFormState((current) => ({
                          ...current,
                          customer_name: event.target.value
                        }));
                      }}
                      placeholder="Alicia Rivera"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product_name">Product name</Label>
                    <Input
                      id="product_name"
                      value={formState.product_name}
                      onChange={(event) => {
                        setFormState((current) => ({
                          ...current,
                          product_name: event.target.value
                        }));
                      }}
                      placeholder="Ergonomic Chair"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={formState.status}
                      onValueChange={(value) => {
                        setFormState((current) => ({ ...current, status: value }));
                      }}
                    >
                      <SelectTrigger className="w-full bg-background/60">
                        <SelectValue placeholder="Choose status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 self-end">
                    <Button type="submit" disabled={isSubmitting} className="w-full rounded-full">
                      {isSubmitting ? "Submitting..." : "Create order"}
                    </Button>
                  </div>
                </form>

                <Separator />

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-2.5 py-1">
                        Auto simulator
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {simulatorState.running ? "Running" : "Idle"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Ticks: {simulatorState.tickCount} · Next delay: {simulatorState.nextDelayMs ?? "-"}ms
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Last action: {simulatorState.lastAction ? `${simulatorState.lastAction.type} order #${simulatorState.lastAction.orderId}` : "No simulated writes yet"}
                    </div>
                    {simulatorState.lastError ? (
                      <div className="text-sm text-red-200">{simulatorState.lastError}</div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      disabled={isSimulatorPending || simulatorState.running}
                      className="rounded-full"
                      onClick={() => {
                        handleSimulator("start");
                      }}
                    >
                      <Play data-icon="inline-start" />
                      {isSimulatorPending && !simulatorState.running ? "Starting..." : "Start simulator"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSimulatorPending || !simulatorState.running}
                      className="rounded-full"
                      onClick={() => {
                        handleSimulator("stop");
                      }}
                    >
                      <Pause data-icon="inline-start" />
                      {isSimulatorPending && simulatorState.running ? "Stopping..." : "Stop simulator"}
                    </Button>
                  </div>
                </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-white/10 bg-card/80 shadow-none">
            <CardHeader className="px-6">
              <CardDescription>Orders table</CardDescription>
              <CardTitle className="text-2xl tracking-tight">Current replicated rows</CardTitle>
              <CardDescription>Each row below reflects the latest state seen by the SSE stream.</CardDescription>
            </CardHeader>
            <CardContent className="px-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="pl-0">ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow className="border-white/10">
                        <TableCell colSpan={6} className="h-24 px-0 text-center text-muted-foreground">
                          No orders to display yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => {
                        const statusMeta = STATUS_META[order.status] || STATUS_META.pending;

                        return (
                          <TableRow key={order.id} className="border-white/10">
                            <TableCell className="pl-0 font-medium">#{order.id}</TableCell>
                            <TableCell>{order.customer_name}</TableCell>
                            <TableCell>{order.product_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("rounded-full", statusMeta.badgeClassName)}>
                                {statusMeta.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatTimestamp(order.updated_at)}
                            </TableCell>
                            <TableCell className="pr-0 text-right">
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  disabled={activeOrderId === Number(order.id)}
                                  onClick={() => {
                                    handleDeleteOrder(order.id);
                                  }}
                                >
                                  <Trash2 />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
