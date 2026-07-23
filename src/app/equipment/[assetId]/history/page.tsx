// src/app/equipment/[assetId]/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/Badge";
import EquipmentLog from "@/components/EquipmentLog";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { EQUIPMENT_STATUS_BADGE, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";

export default function EquipmentHistoryPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const [eq, setEq] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes((session?.user as { role?: string })?.role ?? "");

  useEffect(() => {
    fetch(`/api/equipment/${assetId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setEq)
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!eq || eq.error) {
    return (
      <div className="p-10 text-center text-slate-500">
        Equipment not found.{" "}
        <Link href="/equipment" className="text-emerald-600 hover:underline">Back to registry</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
      <Link href="/equipment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to registry
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Machine History Log</h2>
            <p className="text-xs text-slate-500 font-mono">
              {eq.name} · {eq.assetId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {eq.status && (
            <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
              {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
            </Badge>
          )}
          <Link href={`/equipment/${assetId}`} className="text-xs text-emerald-600 hover:underline ml-2">
            Digital Twin →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <EquipmentLog assetId={assetId} canWrite={canWrite} />
      </div>
    </div>
  );
}
