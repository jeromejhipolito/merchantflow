"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Package } from "lucide-react";

const carrierOptions = [
  { value: "USPS", label: "USPS" },
  { value: "UPS", label: "UPS" },
  { value: "FedEx", label: "FedEx" },
  { value: "DHL", label: "DHL" },
];

const serviceOptions = [
  { value: "ground", label: "Ground" },
  { value: "priority", label: "Priority" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
];

interface CreateShipmentFormProps {
  orderId: string;
  onSuccess?: () => void;
}

export function CreateShipmentForm({
  orderId,
  onSuccess,
}: CreateShipmentFormProps) {
  const [carrier, setCarrier] = useState("");
  const [service, setService] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast.success("Shipment created successfully", {
      description: `Shipment for order ${orderId} is being prepared.`,
    });

    setSubmitting(false);
    onSuccess?.();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-gray-500" />
          <CardTitle>Create Shipment</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Carrier"
              options={carrierOptions}
              placeholder="Select carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            />
            <Select
              label="Service"
              options={serviceOptions}
              placeholder="Select service"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>

          <Input
            label="Weight (grams)"
            type="number"
            placeholder="e.g. 500"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Length (cm)"
              type="number"
              placeholder="30"
              value={length}
              onChange={(e) => setLength(e.target.value)}
            />
            <Input
              label="Width (cm)"
              type="number"
              placeholder="20"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
            <Input
              label="Height (cm)"
              type="number"
              placeholder="10"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Shipment"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
