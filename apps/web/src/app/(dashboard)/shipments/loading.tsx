import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

export default function ShipmentsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}
