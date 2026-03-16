import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function OrderDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-48" />
      <SkeletonCard className="h-24" />
      <div className="grid gap-6 lg:grid-cols-3">
        <SkeletonCard className="h-64 lg:col-span-2" />
        <div className="space-y-6">
          <SkeletonCard className="h-36" />
          <SkeletonCard className="h-36" />
        </div>
      </div>
      <SkeletonCard className="h-48" />
    </div>
  );
}
