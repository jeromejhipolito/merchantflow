import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <SkeletonCard className="h-80" />
      <SkeletonCard className="h-40" />
    </div>
  );
}
