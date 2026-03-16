"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { mockWebhookEndpoints } from "@/lib/mock-data";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { WebhookEndpoint } from "@merchantflow/shared-types";

export function SettingsView() {
  const [endpoints, setEndpoints] = useState(mockWebhookEndpoints);
  const [showForm, setShowForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState("");

  const handleAddEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) {
      toast.error("URL is required");
      return;
    }

    const newEndpoint: WebhookEndpoint = {
      id: `whe_${Date.now()}`,
      storeId: "store_01HQXYZ1A2B3C4D5E6F7G8H9J0",
      url: newUrl.trim(),
      events: newEvents
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: true,
      failureCount: 0,
      lastSucceededAt: null,
      lastFailedAt: null,
      createdAt: new Date().toISOString(),
    };

    setEndpoints((prev) => [...prev, newEndpoint]);
    setNewUrl("");
    setNewEvents("");
    setShowForm(false);
    toast.success("Webhook endpoint added");
  };

  const toggleEndpoint = (id: string) => {
    setEndpoints((prev) =>
      prev.map((ep) =>
        ep.id === id ? { ...ep, isActive: !ep.isActive } : ep
      )
    );
    toast.success("Endpoint updated");
  };

  const removeEndpoint = (id: string) => {
    setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
    toast.success("Endpoint removed");
  };

  return (
    <div className="space-y-6">
      {/* Webhook Endpoints */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-gray-500" />
            <CardTitle>Webhook Endpoints</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus className="h-4 w-4" />
            Add Endpoint
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Form */}
          {showForm && (
            <form
              onSubmit={handleAddEndpoint}
              className="rounded-lg border border-brand-200 bg-brand-50/30 p-4"
            >
              <h4 className="mb-3 text-sm font-semibold text-gray-900">
                New Webhook Endpoint
              </h4>
              <div className="space-y-3">
                <Input
                  label="Endpoint URL"
                  placeholder="https://your-app.com/webhooks/merchantflow"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
                <Input
                  label="Events (comma-separated)"
                  placeholder="order.created, order.fulfilled, shipment.shipped"
                  value={newEvents}
                  onChange={(e) => setNewEvents(e.target.value)}
                  helperText="Leave empty to subscribe to all events"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm">
                    Add Endpoint
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Endpoint List */}
          {endpoints.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No webhook endpoints configured.
            </div>
          ) : (
            <div className="space-y-3">
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={ep.isActive ? "success" : "default"}
                        >
                          {ep.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {ep.failureCount > 0 && (
                          <Badge variant="warning">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {ep.failureCount} failures
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <p className="truncate font-mono text-sm text-gray-900">
                          {ep.url}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ep.events.map((event) => (
                          <span
                            key={event}
                            className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                        <span>Created {formatDate(ep.createdAt)}</span>
                        {ep.lastSucceededAt && (
                          <span>
                            Last success{" "}
                            {formatRelativeTime(ep.lastSucceededAt)}
                          </span>
                        )}
                        {ep.lastFailedAt && (
                          <span className="text-red-400">
                            Last failure{" "}
                            {formatRelativeTime(ep.lastFailedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => toggleEndpoint(ep.id)}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title={
                          ep.isActive
                            ? "Deactivate endpoint"
                            : "Activate endpoint"
                        }
                      >
                        {ep.isActive ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => removeEndpoint(ep.id)}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove endpoint"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>API Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">API Base URL</dt>
              <dd className="font-mono text-sm text-gray-900">
                {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Environment</dt>
              <dd>
                <Badge variant="info">Development</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Version</dt>
              <dd className="text-sm text-gray-900">0.1.0</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
