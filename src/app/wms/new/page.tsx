// src/app/wms/new/page.tsx
"use client";

import Select from "@/components/Select";
import { PAGE_MAIN } from "@/lib/page-shell";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2, Layers, Loader2 } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import ChainPreview from "@/components/ChainPreview";
import { WMS_CHAIN } from "@/lib/signoff/chains";

function NewWmsForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A method statement written for a batch covers every machine in it. The
  // scope is settled by the batch, not picked here, so the form stops asking
  // and starts telling.
  const batchId = searchParams.get("batchId") ?? "";
  const [batch, setBatch] = useState<any>(null);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scope, setScope] = useState("");
  const [mobilization, setMobilization] = useState("");
  const [rawTools, setRawTools] = useState("");
  // Materials used to be a comma-separated box. Somebody typed "bearing, seal"
  // and the spares register never heard about it, so the one number the
  // register exists to produce — what is below its minimum — was guesswork.
  // A method statement names parts that exist, by the number the storeman
  // will look for.
  const [spares, setSpares] = useState<any[]>([]);
  const [pickedParts, setPickedParts] = useState<
    { sparePartId: string; partNumber: string; name: string; quantity: string }[]
  >([]);
  const [partToAdd, setPartToAdd] = useState("");
  const [hseRequirements, setHseRequirements] = useState("");
  const [qualityControlRequirements, setQualityControlRequirements] = useState("");
  const [emergencyRequirements, setEmergencyRequirements] = useState("");
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  // Prefilled when the method statement is being written for a job that has
  // already been raised, which is the normal case for a breakdown repair.
  const [workOrderId, setWorkOrderId] = useState(searchParams.get("workOrderId") ?? "");
  const [workOrders, setWorkOrders] = useState<any[]>([]);

  // Procedure Steps
  const [steps, setSteps] = useState<string[]>([""]);

  useEffect(() => {
    if (!batchId) return;
    fetch(`/api/pm-batches/${batchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!b) return;
        setBatch(b);
        setTitle((t: string) => t || `Method statement, ${b.title}`);
      })
      .catch(() => {});
  }, [batchId]);

  useEffect(() => {
    async function loadEquipment() {
      try {
        const res = await fetch("/api/equipment");
        if (res.ok) {
          const data = await res.json();
          setEquipmentList(data);
        }
      } catch (err) {
        console.error("Failed to load machinery:", err);
      } finally {
        setLoadingEq(false);
      }
    }
    loadEquipment();
  }, []);

  // Every live work order, not just approved ones. A method statement is now
  // written when the job is identified, which is usually before anyone has
  // signed the authorisation, so filtering to approved work orders here was
  // what created the deadlock.
  useEffect(() => {
    fetch("/api/spares")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSpares(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/work-orders")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) =>
        setWorkOrders(
          Array.isArray(d)
            ? d.filter((w: any) => w.status !== "CANCELLED")
            : [],
        ),
      )
      .catch(() => setWorkOrders([]));
  }, []);

  const addStepField = () => {
    setSteps([...steps, ""]);
  };

  const removeStepField = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepValue = (index: number, val: string) => {
    setSteps(steps.map((s, i) => (i === index ? val : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const parsedTools = rawTools.split(",").map((s) => s.trim()).filter(Boolean);
    const parsedMaterials = pickedParts.map((p) => ({
      sparePartId: p.sparePartId,
      partNumber: p.partNumber,
      name: p.name,
      quantity: Number(p.quantity) || 1,
    }));
    const parsedSteps = steps.map((s) => s.trim()).filter(Boolean);

    // Determine machinery scope names based on selected IDs
    const scopeNames = selectedEquipments.map((id) => {
      const match = equipmentList.find((eq) => eq.id === id);
      return match ? match.name : "";
    }).filter(Boolean);

    try {
      const res = await fetch("/api/wms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          workOrderId,
          purpose,
          scope,
          mobilization,
          equipmentAndTools: parsedTools,
          materials: parsedMaterials,
          workProcedureSteps: parsedSteps,
          hseRequirements,
          qualityControlRequirements: qualityControlRequirements,
          emergencyRequirements: emergencyRequirements,
          batchId: batchId || undefined,
          equipmentIds: selectedEquipments,
          machinesScope: scopeNames,
          // preparer is stamped from the session server-side
        }),
      });

      if (res.ok) {
        router.push("/wms");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipmentSelect = (id: string) => {
    setSelectedEquipments(
      selectedEquipments.includes(id)
        ? selectedEquipments.filter((x) => x !== id)
        : [...selectedEquipments, id]
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.form}>
        <PageHeader
          title="Draft a Work Method Statement"
          subtitle="Set out how the job will be done safely, step by step, for review and approval"
          backHref="/wms"
          backLabel="Work Method Statements"
        />
        <form onSubmit={handleSubmit} className="p-6 bg-surface border border-line rounded-xl shadow-card space-y-8">
          <h2 className="text-base font-semibold text-ink-900 border-b border-ink-200 pb-3">
            Create Work Method Statement (WMS)
          </h2>

          {/* When the job is a batch, the scope is not a question. Saying so
              plainly, and listing the machines, is what stops somebody
              writing a method for one machine and permitting five. */}
          {batch && (
            <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
              <div className="flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">
                    {batch.batchNumber}, {batch.title}
                  </p>
                  <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                    This method statement covers every machine in the batch. The scope is taken from
                    the batch when it is saved, so it cannot end up covering fewer machines than the
                    permit does.
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {(batch.workOrders ?? []).map((w: any) => (
                      <li key={w.id} className="text-xs bg-surface border border-line rounded px-2 py-0.5 text-ink-700">
                        {[w.assetId, w.machineName].filter(Boolean).join(" ")}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* The job this method statement is written for */}
          <div className={`space-y-2 ${batch ? "hidden" : ""}`}>
            <label className="text-sm font-medium text-ink-700">
              Work order <span className="font-normal text-ink-500">(optional)</span>
            </label>
            <Select
              value={workOrderId}
              onChange={setWorkOrderId}
              ariaLabel="Approved work order"
              className="w-full"
            >
              <option value="">Not raised yet</option>
              {workOrders.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.workOrderNumber} · {w.title}
                </option>
              ))}
            </Select>
            <p className="text-xs text-ink-500">
              Leave this if the job has not been raised yet. A method statement can be written
              before the work is authorised, and often should be, because the authorisation
              depends on knowing how the job will be done. The work order has to be approved
              before a permit can be issued at the end of the chain.
            </p>
          </div>

          {/* Document Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-700">Document Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Work Method Statement for Spindle Bearing Replacement on JOBS Boring Machine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none"
            />
          </div>

          {/* The machines this method statement covers.
              This list used to read LEE/PE/0114, LEE/PE/0115, LEE/PE/0116 and
              nothing else, so the person deciding which machines a job may
              touch was picking them by a number nobody says out loud. Naming
              the machine is what makes the choice checkable, and getting it
              wrong here scopes a permit onto the wrong machine. */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-700 block">Associated machinery scope</label>
            {loadingEq ? (
              <p className="text-sm text-ink-500">Loading the asset register…</p>
            ) : equipmentList.length === 0 ? (
              <p className="text-sm text-ink-500">
                No machines are on the register yet, so there is nothing to scope this statement to.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-surface divide-y divide-line">
                {equipmentList.map((eq) => {
                  const selected = selectedEquipments.includes(eq.id);
                  return (
                    <label
                      key={eq.id}
                      className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none transition-colors ${
 selected ? "bg-brand-50" : "hover:bg-ink-50"
 }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleEquipmentSelect(eq.id)}
                        className="rounded-lg border-ink-300 accent-brand-600 w-4 h-4 mt-0.5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-900 truncate">{eq.name}</span>
                        <span className="block text-xs text-ink-500 tabular-nums">
                          {eq.assetId}
                          {eq.location ? ` · ${eq.location}` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-ink-500">
              {selectedEquipments.length === 0
                ? "Select every machine the working party will be on or near."
                : `${selectedEquipments.length} machine${selectedEquipments.length === 1 ? "" : "s"} in scope.`}
            </p>
          </div>

          {/* Scope / Purpose */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Purpose of operation</label>
              <textarea
                required
                placeholder="Describe the main objectives of this technical operation..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full h-20 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Scope of work</label>
              <textarea
                required
                placeholder="Outline boundaries, targeted machinery subcomponents..."
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full h-20 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Tools & Materials list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Equipment & Tools Needed</label>
              <input
                type="text"
                placeholder="Tool A, Tool B, Tool C (comma separated)..."
                value={rawTools}
                onChange={(e) => setRawTools(e.target.value)}
                className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Materials &amp; spares needed</label>
              <p className="text-xs text-ink-500">
                Chosen from the spares register, so what this method needs and what the store holds are
                the same list. Typed-in names were invisible to the below-minimum warning.
              </p>
              <div className="flex gap-2">
                <Select
                  value={partToAdd}
                  onChange={(v) => {
                    const part = spares.find((sp: any) => sp.id === v);
                    if (!part) return;
                    setPickedParts((cur) =>
                      cur.some((c) => c.sparePartId === part.id)
                        ? cur
                        : [
                            ...cur,
                            {
                              sparePartId: part.id,
                              partNumber: part.partNumber,
                              name: part.name,
                              quantity: "1",
                            },
                          ],
                    );
                    setPartToAdd("");
                  }}
                  ariaLabel="Add a spare part"
                  className="flex-1"
                >
                  <option value="">Add a part from the register…</option>
                  {spares.map((sp: any) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.partNumber} · {sp.name}
                      {sp.brand ? ` · ${sp.brand}` : ""} ({sp.quantityOnHand} on hand)
                    </option>
                  ))}
                </Select>
              </div>

              {pickedParts.length > 0 && (
                <ul className="divide-y divide-ink-200 border border-ink-200 rounded-lg">
                  {pickedParts.map((pp, i) => (
                    <li key={pp.sparePartId} className="flex items-center gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-ink-900 truncate">{pp.name}</p>
                        <p className="text-xs text-ink-500">{pp.partNumber}</p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={pp.quantity}
                        onChange={(e) =>
                          setPickedParts((cur) =>
                            cur.map((c, j) => (j === i ? { ...c, quantity: e.target.value } : c)),
                          )
                        }
                        className="w-20 bg-ink-100 border border-ink-200 rounded-lg p-1.5 text-xs text-center"
                        aria-label={`Quantity of ${pp.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => setPickedParts((cur) => cur.filter((_, j) => j !== i))}
                        className="text-ink-400 hover:text-danger-600"
                        aria-label={`Remove ${pp.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* This was submitted on every method statement with no way to fill
              it, so every record stored an empty string. */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-700">Mobilization</label>
            <textarea
              placeholder="Access, isolation arranged, permits raised, people and plant on site before work starts..."
              value={mobilization}
              onChange={(e) => setMobilization(e.target.value)}
              rows={2}
              className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
            />
          </div>

          {/* Procedure Steps Inputs */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-ink-700">Detailed Work Procedure Steps</label>
              <button
                type="button"
                onClick={addStepField}
                className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-all"
              >
                + Add Step
              </button>
            </div>

            <div className="space-y-2.5">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2.5 items-center">
                  <span className="w-6 h-6 rounded-lg bg-ink-100 border border-ink-200 text-ink-500 font-bold text-xs flex items-center justify-center">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={`Step ${String.fromCharCode(65 + i)} procedure details...`}
                    value={step}
                    onChange={(e) => updateStepValue(i, e.target.value)}
                    className="flex-1 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2 text-xs focus:outline-none"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStepField(i)}
                      className="p-2 text-danger-500 hover:bg-ink-100 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* HSE Requirements */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-ink-700">HSE & Safe Work Requirements</label>
            <textarea
              required
              placeholder="Detail LOTO isolation points, safety barriers, gas tests, PPE levels..."
              value={hseRequirements}
              onChange={(e) => setHseRequirements(e.target.value)}
              className="w-full h-16 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
            />
          </div>

          {/* QAQC & Emergency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Quality Control & Tolerance Inspections</label>
              <textarea
                placeholder="Visual inspections, torque settings, dial test alignment check values..."
                value={qualityControlRequirements}
                onChange={(e) => setQualityControlRequirements(e.target.value)}
                className="w-full h-16 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Emergency & Spillage Response Plan</label>
              <textarea
                placeholder="Steps if oil spill, electrical fire, emergency stop activation occurs..."
                value={emergencyRequirements}
                onChange={(e) => setEmergencyRequirements(e.target.value)}
                className="w-full h-16 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Who has to sign this, before it is written rather than after.
              Four named authorities reading a method statement is a different
              proposition from a supervisor glancing at it, and knowing which it
              is changes how much detail goes in. */}
          <ChainPreview
            steps={WMS_CHAIN}
            note="Saving puts this in draft. It goes for signature in this order once you submit it, and each person can return it with a comment rather than only approving or rejecting."
          />

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-3">
            <Button variant="secondary" href="/wms">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} loading={saving}>
              Save Draft WMS
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

// useSearchParams suspends, so the page needs a boundary or the build cannot
// prerender it.
export default function NewWmsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-ink-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      }
    >
      <NewWmsForm />
    </Suspense>
  );
}
