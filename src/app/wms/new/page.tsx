// src/app/wms/new/page.tsx
"use client";

import Select from "@/components/Select";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import ChainPreview from "@/components/ChainPreview";
import { WMS_CHAIN } from "@/lib/signoff/chains";

export default function NewWms() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scope, setScope] = useState("");
  const [mobilization, setMobilization] = useState("");
  const [rawTools, setRawTools] = useState("");
  const [rawMaterials, setRawMaterials] = useState("");
  const [hseRequirements, setHseRequirements] = useState("");
  const [qualityControlRequirements, setQualityControlRequirements] = useState("");
  const [emergencyRequirements, setEmergencyRequirements] = useState("");
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [workOrderId, setWorkOrderId] = useState("");
  const [workOrders, setWorkOrders] = useState<any[]>([]);

  // Procedure Steps
  const [steps, setSteps] = useState<string[]>([""]);

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
    const parsedMaterials = rawMaterials.split(",").map((s) => s.trim()).filter(Boolean);
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
      <main className="flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto space-y-8">
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

          {/* The job this method statement is written for */}
          <div className="space-y-2">
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
              <label className="text-sm font-medium text-ink-700">Materials & Spares Needed</label>
              <input
                type="text"
                placeholder="Material X, Spare Part Y (comma separated)..."
                value={rawMaterials}
                onChange={(e) => setRawMaterials(e.target.value)}
                className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none"
              />
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
