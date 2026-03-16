import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card } from "./card";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendLabel,
  className,
}: StatCardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-gray-900">
            {value}
          </p>
          {trend !== undefined && (
            <div className="flex items-center gap-1">
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-600" />
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                  isPositive ? "text-emerald-600" : "text-red-600"
                )}
              >
                {isPositive ? "+" : ""}
                {trend}%
              </span>
              {trendLabel && (
                <span className="text-xs text-gray-400">{trendLabel}</span>
              )}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-brand-50 p-2.5">
          <Icon className="h-5 w-5 text-brand-600" />
        </div>
      </div>
    </Card>
  );
}
