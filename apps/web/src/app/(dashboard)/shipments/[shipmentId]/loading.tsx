import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function ShipmentDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-48" />
      <SkeletonCard className="h-24" />
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-72" />
        <div className="space-y-6">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-36" />
        </div>
      </div>
    </div>
  );
}
