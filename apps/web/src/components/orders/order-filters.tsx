"use client";

import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Search } from "lucide-react";

const fulfillmentOptions = [
  { value: "", label: "All Statuses" },
  { value: "UNFULFILLED", label: "Unfulfilled" },
  { value: "PARTIALLY_FULFILLED", label: "Partially Fulfilled" },
  { value: "FULFILLED", label: "Fulfilled" },
  { value: "RESTOCKED", label: "Restocked" },
];

const financialOptions = [
  { value: "", label: "All Financial" },
  { value: "PENDING", label: "Pending" },
  { value: "AUTHORIZED", label: "Authorized" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIALLY_REFUNDED", label: "Partial Refund" },
  { value: "REFUNDED", label: "Refunded" },
];

export function OrderFilters() {
  const [search, setSearch] = useQueryState("q", { defaultValue: "" });
  const [status, setStatus] = useQueryState("status", { defaultValue: "" });
  const [financial, setFinancial] = useQueryState("financial", {
    defaultValue: "",
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search orders..."
          value={search}
          onChange={(e) => setSearch(e.target.value || null)}
          className="pl-9"
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          options={fulfillmentOptions}
          value={status}
          onChange={(e) => setStatus(e.target.value || null)}
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          options={financialOptions}
          value={financial}
          onChange={(e) => setFinancial(e.target.value || null)}
        />
      </div>
    </div>
  );
}
