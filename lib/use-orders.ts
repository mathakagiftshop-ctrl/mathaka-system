"use client";

import { useEffect, useState } from "react";
import type { CelebrationOrder } from "@/lib/types";

export function useOrders() {
  const [orders, setOrders] = useState<CelebrationOrder[]>([]);
  const [source, setSource] = useState<"loading" | "supabase" | "demo" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/orders", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Your session expired." : "Celebrations could not be loaded.");
        return response.json();
      })
      .then((data: { orders: CelebrationOrder[]; source: "supabase" | "demo" }) => {
        setOrders(data.orders);
        setSource(data.source);
        setError("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSource("error");
        setError(error instanceof Error ? error.message : "Celebrations could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshKey]);

  return { orders, source, error, refetch: () => setRefreshKey((key) => key + 1) };
}

export function useOrder(id: string, initialOrder: CelebrationOrder) {
  const [order, setOrder] = useState(initialOrder);
  const [source, setSource] = useState<"loading" | "supabase" | "demo" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/orders/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "This celebration could not be found." : response.status === 401 ? "Your session expired." : "Celebration details could not be loaded.");
        return response.json();
      })
      .then((data: { order: CelebrationOrder; source: "supabase" | "demo" }) => {
        setOrder(data.order);
        setSource(data.source);
        setError("");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSource("error");
        setError(error instanceof Error ? error.message : "Celebration details could not be loaded.");
      });
    return () => controller.abort();
  }, [id, refreshKey]);

  return { order, source, error, refetch: () => setRefreshKey((key) => key + 1) };
}
