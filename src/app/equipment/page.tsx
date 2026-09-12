// src/app/equipment/page.tsx
"use client";

import Criticality from "@/components/Criticality";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  QrCode,
  Eye,
  History,
  Pencil,
  Plus,
  Stethoscope,
  AlertTriangle,
  Download,
  ArchiveX,
  Trash2,
  Undo2,
} from "lucide-react";
import KebabMenu from "@/components/KebabMenu";
import Button from "@/components/Button";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { useApi } from "@/lib/api-cache";
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_BADGE,
  CRITICALITY_SHORT,
} from "@/lib/constants";
import { parseAssetId, ASSET_PREFIXES, ASSET_PREFIX_META, type AssetPrefix } from "@/lib/asset-id";
import { downloadCSV } from "@/lib/export";
import LoadError from "@/components/LoadError";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { isSuperAdmin } from "@/lib/roles";
import { RemoveFromRegisterModal, DeleteAssetModal } from "@/components/AssetRemoval";

// An asset in one of these states is not doing its job. The register's whole
// purpose is answering "what needs me today", which the old flat list buried.
const NEEDS_ATTENTION = new Set(["BROKEN_DOWN", "AWAITING_PARTS", "UNDER_MAINTENANCE"]);

type TypeTab = "ALL" | AssetPrefix;

// Declared at module scope on purpose. A component defined inside another is a
// new type on every render, so React unmounts and remounts its subtree, which is
// how an input loses focus mid-typing.
function SortIcon({ field, active, direction }: { field: string; active: string; direction: string }) {
  if (active !== field) return <ArrowUpDown className="w-3.5 h-3.5 text-ink-400" />;
  return direction === "asc" ? (
    <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
  ) : (
    <ArrowDown className="w-3.5 h-3.5 text-brand-600" />
  );
}

export default function EquipmentList() {
  const { data: equipmentList, loading, error, refresh } = useApi<any[]>("/api/equipment", []);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeTab, setTypeTab] = useState<TypeTab>("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
  // Removed assets are off the register by default. They are still reachable,
  // because "where did that machine go" is a question somebody asks, and the
  // answer has to be findable rather than only in the audit log.
  const [showRemoved, setShowRemoved] = useState(false);
  const [removing, setRemoving] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  // Deferred past mount: the session resolves client-side only, and rendering
  // a role-dependent menu item during SSR is the hydration trap AGENTS.md
  // records as a real past bug.
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canPurge = mounted && isSuperAdmin((session?.user as { role?: string })?.role);

  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const filtersActive =
    search.trim() !== "" ||
    categoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    typeTab !== "ALL" ||
    attentionOnly;
  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setTypeTab("ALL");
    setAttentionOnly(false);
  };

  const prefixOf = (eq: any): AssetPrefix => parseAssetId(eq.assetId)?.prefix ?? "PE";

  // Counted per prefix rather than "SYS or else a machine". The old shape
  // silently folded any new series into the machine count, so the 19 office AC
  // units would have been reported as machines on the register everyone quotes.
  // Removed assets are excluded from every count. The header reads "56 assets:
  // 37 machines, 19 office units" and that is the number quoted in meetings, so
  // it has to mean what is on the register rather than what the table holds.
  const counts = useMemo(() => {
    const byPrefix = Object.fromEntries(ASSET_PREFIXES.map((p) => [p, 0])) as Record<AssetPrefix, number>;
    let attention = 0;
    let total = 0;
    for (const eq of equipmentList) {
      if (eq.removedAt) continue;
      total++;
      byPrefix[prefixOf(eq)]++;
      if (NEEDS_ATTENTION.has(eq.status)) attention++;
    }
    return { byPrefix, attention, total };
  }, [equipmentList]);

  const removedCount = useMemo(
    () => equipmentList.filter((e) => e.removedAt).length,
    [equipmentList],
  );

  // Names only the series that are actually present. A register holding nothing
  // but machines should not announce "0 office and facility".
  const registerSummary = useMemo(() => {
    const total = `${counts.total} asset${counts.total === 1 ? "" : "s"}`;
    const present = ASSET_PREFIXES.filter((p) => counts.byPrefix[p] > 0);
    if (present.length < 2) return total;
    return `${total}: ${present
      .map((p) => `${counts.byPrefix[p]} ${ASSET_PREFIX_META[p].noun}`)
      .join(", ")}`;
  }, [counts]);

  const filteredEquipment = equipmentList.filter((eq) => {
    const term = search.toLowerCase();
    const matchesSearch =
      (eq.name || "").toLowerCase().includes(term) ||
      (eq.assetId || "").toLowerCase().includes(term) ||
      (eq.serialNumber || "").toLowerCase().includes(term) ||
      (eq.oem || "").toLowerCase().includes(term);

    const matchesCategory = categoryFilter === "ALL" || eq.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || eq.status === statusFilter;
    const matchesType = typeTab === "ALL" || prefixOf(eq) === typeTab;
    const matchesAttention = !attentionOnly || NEEDS_ATTENTION.has(eq.status);
    const matchesRemoved = showRemoved ? !!eq.removedAt : !eq.removedAt;

    return (
      matchesSearch && matchesCategory && matchesStatus && matchesType && matchesAttention &&
      matchesRemoved
    );
  });

  const sortedEquipment = [...filteredEquipment].sort((a: any, b: any) => {
    const fieldA = (a[sortField] || "").toString().toLowerCase();
    const fieldB = (b[sortField] || "").toString().toLowerCase();
    if (fieldA < fieldB) return sortDirection === "asc" ? -1 : 1;
    if (fieldA > fieldB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const exportCsv = () => {
    downloadCSV(
      `asset-register-${new Date().toISOString().slice(0, 10)}`,
      sortedEquipment.map((eq) => ({
        "Asset ID": eq.assetId,
        Name: eq.name,
        Type: prefixOf(eq),
        Category: EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category,
        "OEM / Vendor": eq.oem || "",
        Model: eq.model || "",
        "Serial Number": eq.serialNumber || "",
        Location: eq.location || "",
        Status: EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status,
        Criticality: CRITICALITY_SHORT[eq.criticality] ?? eq.criticality ?? "",
        "Service Interval": eq.maintenanceFrequency || "",
        Commissioned: eq.commissioningDate || "",
      })),
    );
  };

  // Derive the category filter from the categories actually present, so it always
  // covers the real data (the old hardcoded list missed several categories).
  const categories = [
    "ALL",
    ...Array.from(new Set(equipmentList.map((e) => e.category).filter(Boolean))).sort((a, b) =>
      (EQUIPMENT_CATEGORY_LABELS[a] ?? a).localeCompare(EQUIPMENT_CATEGORY_LABELS[b] ?? b),
    ),
  ];
  const statuses = ["ALL", ...Object.keys(EQUIPMENT_STATUS_LABELS)];
  const catLabel = (c: string) =>
    c === "ALL" ? "All categories" : EQUIPMENT_CATEGORY_LABELS[c] ?? c.replaceAll("_", " ");
  const statusLabel = (s: string) =>
    s === "ALL" ? "All statuses" : EQUIPMENT_STATUS_LABELS[s] ?? s.replaceAll("_", " ");

  const rowActions = (eq: any) => {
    const urlParam = (eq.assetId || "").replace(/\//g, "-");
    return [
      { label: "Digital Twin", icon: Eye, href: `/equipment/${urlParam}` },
      // The diagnostic engine was reachable only via a banner on the twin page,       // the most valuable feature in the product, effectively hidden.
      { label: "Troubleshoot", icon: Stethoscope, href: `/equipment/${urlParam}/troubleshoot` },
      { label: "Report Fault", icon: AlertTriangle, href: `/corrective/new?equipmentId=${eq.id}`, danger: true },
      { label: "History Log", icon: History, href: `/equipment/${urlParam}/history` },
      { label: "Edit", icon: Pencil, href: `/equipment/${urlParam}/edit` },
      { label: "Print QR Code", icon: QrCode, href: `/equipment/qr/${urlParam}` },
      ...(eq.removedAt
        ? [{ label: "Put back on the register", icon: Undo2, onClick: () => restore(eq) }]
        : [{ label: "Remove from register", icon: ArchiveX, onClick: () => setRemoving(eq) }]),
      // Super Admin only. The route checks this again and the password on top;
      // hiding the item is so nobody is offered a control they cannot use.
      ...(canPurge
        ? [{ label: "Delete permanently", icon: Trash2, onClick: () => setDeleting(eq), danger: true }]
        : []),
    ];
  };

  const restore = async (eq: any) => {
    const res = await fetch(`/api/equipment/${(eq.assetId || "").replace(/\//g, "-")}/removal`, {
      method: "PATCH",
    });
    if (res.ok) {
      toast.success(`${eq.name} is back on the register.`);
      refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Could not restore the asset.");
    }
  };

  const emptyState = filtersActive ? (
    <EmptyState
      icon={Search}
      title="Nothing matches these filters"
      message="No asset on the register matches the current search, type, category and status."
      actionLabel="Clear filters"
      onAction={clearFilters}
    />
  ) : (
    <EmptyState
      icon={Layers}
      title="No assets registered yet"
      message="The register is empty. Add your first machine or facility system to start raising work orders against it."
      actionLabel="Add an asset"
      actionHref="/equipment/new"
    />
  );

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
        <PageHeader
          title="Asset Register"
          subtitle={
            loading
              ? "Every machine, facility system and serviced unit, with status, criticality and location"
              : registerSummary
          }
          backHref="/"
          backLabel="Dashboard"
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!sortedEquipment.length}>
                Export
              </Button>
              <Button href="/equipment/new" icon={Plus}>
                Add Asset
              </Button>
            </>
          }
        />

        {/* Type segment + the question the register exists to answer */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Wraps between tabs, never inside a label. A fourth series pushed
              this past a 375px phone, and the segment broke "Office & facility"
              across three lines rather than moving a whole tab down. */}
          <div className="flex flex-wrap gap-1 bg-ink-100 border border-ink-200 rounded-lg p-1 w-fit">
            {(["ALL", ...ASSET_PREFIXES] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeTab(t)}
                title={t === "ALL" ? undefined : ASSET_PREFIX_META[t].help}
                className={`px-3 min-h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
 typeTab === t ? "bg-white text-brand-600 shadow-card" : "text-ink-500 hover:text-ink-900"
 }`}
              >
                {t === "ALL"
                  ? `All (${counts.total})`
                  : `${ASSET_PREFIX_META[t].tab} (${counts.byPrefix[t]})`}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAttentionOnly((v) => !v)}
            aria-pressed={attentionOnly}
            className={`inline-flex items-center gap-2 px-3 min-h-9 rounded-lg border text-xs font-semibold transition-colors w-fit ${
 attentionOnly
 ? "bg-danger-50 border-danger-300 text-danger-700"
 : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
 }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Needs attention
            <span
              className={`px-1.5 py-0.5 rounded-lg text-xs ${
 counts.attention ? "bg-danger-600 text-white" : "bg-ink-100 text-ink-500"
 }`}
            >
              {counts.attention}
            </span>
          </button>

          {removedCount > 0 && (
            <button
              onClick={() => setShowRemoved((v) => !v)}
              aria-pressed={showRemoved}
              className={`inline-flex items-center gap-2 px-3 min-h-9 rounded-lg border text-xs font-semibold transition-colors w-fit ${
                showRemoved
                  ? "bg-ink-100 border-ink-300 text-ink-800"
                  : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
              }`}
            >
              <ArchiveX className="w-4 h-4" />
              Removed
              <span className="px-1.5 py-0.5 rounded-lg text-xs bg-ink-100 text-ink-500">
                {removedCount}
              </span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="p-4 bg-surface border border-line rounded-xl shadow-card flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input
              type="text"
              placeholder="Search name, asset ID, serial or OEM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg min-h-11 pl-10 pr-4 text-sm placeholder-ink-500 focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto md:justify-end">
            <Select value={categoryFilter} onChange={setCategoryFilter} className="flex-1 md:flex-none">
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {catLabel(cat)}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={setStatusFilter} className="flex-1 md:flex-none">
              {statuses.map((stat) => (
                <option key={stat} value={stat}>
                  {statusLabel(stat)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && !loading ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <LoadError what="the asset register" onRetry={refresh} />
          </div>
        ) : loading ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : !sortedEquipment.length ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">{emptyState}</div>
        ) : (
          <>
            {/* Mobile, the register was table-only, unusable on the floor */}
            <div className="grid gap-3 md:hidden">
              {sortedEquipment.map((eq) => {
                const urlParam = (eq.assetId || "").replace(/\//g, "-");
                return (
                  <div key={eq.id} data-list-card className="bg-surface border border-line rounded-xl shadow-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/equipment/${urlParam}`} className="min-w-0">
                        <p className="font-semibold text-ink-900 text-sm leading-snug">{eq.name}</p>
                        <p className="text-xs text-ink-500 mt-0.5">{eq.assetId}</p>
                      </Link>
                      <KebabMenu ariaLabel={`Actions for ${eq.name}`} items={rowActions(eq)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                        {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
                      </Badge>
                      <Criticality value={eq.criticality} />
                    </div>
                    <p className="text-xs text-ink-500 mt-2.5">
                      {EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category} · {eq.location || "-"}
                      {eq.oem ? ` · ${eq.oem}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="hidden md:block bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-ink-200 bg-ink-50 text-ink-500 font-semibold select-none">
                      <th className="py-2.5 px-4 cursor-pointer hover:text-ink-900" onClick={() => handleSort("name")}>
                        <div className="flex items-center gap-1">
                          Machine <SortIcon active={sortField} direction={sortDirection} field="name" />
                        </div>
                      </th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Category</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">OEM / Vendor</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Location</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                      <th className="py-2.5 px-4 whitespace-nowrap">Criticality</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {sortedEquipment.map((eq) => {
                      const urlParam = (eq.assetId || "").replace(/\//g, "-");
                      return (
                        <tr key={eq.id} className="hover:bg-ink-50 text-ink-600 transition-colors">
                          <td className="py-2.5 px-4">
                            <Link href={`/equipment/${urlParam}`} className="font-medium text-ink-900 hover:text-brand-600">
                              {eq.name}
                            </Link>
                            {eq.assetId && (
                              <span className="block text-xs text-ink-500 tabular-nums">{eq.assetId}</span>
                            )}
                          </td>
                          {/* Category is a fixed vocabulary, so it never needs
                              to wrap. "Measuring Instruments" breaking onto two
                              lines here was setting the height of most rows in
                              the register while OEM and Location sat with
                              visible slack beside it. */}
                          <td className="py-2.5 px-4 text-ink-600 whitespace-nowrap">
                            {EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category?.replaceAll("_", " ")}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">{eq.oem || "-"}</td>
                          <td className="py-2.5 px-4 text-ink-600 whitespace-nowrap">{eq.location || "-"}</td>
                          <td className="py-2.5 px-4">
                            <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                              {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4">
                            <Criticality value={eq.criticality} />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex justify-end">
                              <KebabMenu ariaLabel={`Actions for ${eq.name}`} items={rowActions(eq)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <RemoveFromRegisterModal
        asset={removing}
        onClose={() => setRemoving(null)}
        onDone={refresh}
      />
      <DeleteAssetModal asset={deleting} onClose={() => setDeleting(null)} onDone={refresh} />
    </div>
  );
}
