// src/components/Skeleton.tsx
// Wireframes instead of spinners.
//
// A spinner collapses the whole page to a dot and says nothing about what is
// coming. A wireframe in the shape of the real screen reads as faster than a
// spinner at the same actual speed, because the layout stops moving the moment
// data lands rather than being built from nothing.
//
// These render entirely from client JS with no server round-trip, which is what
// lets them appear instantly once the app shell is cached, on a phone with no
// signal the shell and the wireframe are what the technician sees while the
// network is still being decided.
"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-slate-100 rounded animate-pulse ${className}`} />;
}

// The header every page renders: back link, icon, title, subtitle, actions.
function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-3 w-28" />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: lines }).map((_, i) => (
        // Ragged widths so it reads as prose rather than a grid.
        <Skeleton key={i} className={`h-3 ${i % 3 === 2 ? "w-2/3" : i % 3 === 1 ? "w-5/6" : "w-full"}`} />
      ))}
    </div>
  );
}

export type SkeletonVariant = "detail" | "form" | "dashboard" | "list";

/**
 * A full-page wireframe. `variant` picks the shape of the screen that is about
 * to appear, so the placeholder and the real thing occupy the same space and
 * nothing jumps when the data arrives.
 */
export default function PageSkeleton({
  variant = "detail",
  label = "Loading",
}: {
  variant?: SkeletonVariant;
  label?: string;
}) {
  return (
    <div
      className="min-h-screen bg-slate-50 p-4 sm:p-6"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className="max-w-7xl w-full mx-auto space-y-5">
        <HeaderSkeleton />

        {variant === "dashboard" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Skeleton className="h-44 rounded-xl" />
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Skeleton className="h-44 rounded-xl" />
                <Skeleton className="h-44 rounded-xl" />
                <Skeleton className="h-44 rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                <CardSkeleton lines={5} />
              </div>
              <CardSkeleton lines={4} />
            </div>
          </>
        )}

        {variant === "detail" && (
          <>
            <Skeleton className="h-24 rounded-xl" />
            <div className="flex gap-6 border-b border-slate-200 pb-2.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <CardSkeleton lines={4} />
                <CardSkeleton lines={3} />
              </div>
              <div className="space-y-4">
                <CardSkeleton lines={3} />
                <CardSkeleton lines={2} />
              </div>
            </div>
          </>
        )}

        {variant === "form" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 max-w-3xl">
            <div className="space-y-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-11 rounded-lg" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Skeleton className="h-11 w-24 rounded-lg" />
              <Skeleton className="h-11 w-32 rounded-lg" />
            </div>
          </div>
        )}

        {variant === "list" && (
          <>
            <Skeleton className="h-16 rounded-xl" />
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              {Array.from({ length: 7 }).map((_, r) => (
                <div key={r} className="flex gap-4 items-center">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-4 w-1/5" />
                  <Skeleton className="h-4 w-1/6" />
                  <Skeleton className="h-4 w-1/6" />
                  <Skeleton className="h-4 w-1/12" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
