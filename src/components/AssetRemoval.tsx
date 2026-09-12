// src/components/AssetRemoval.tsx
// The two ways an asset leaves the register, as two dialogues that do not look
// alike, because they are not alike.
//
// Retiring is routine and reversible: choose why, and the machine leaves the
// default view keeping every record attached to it. Deleting is neither, and
// the dialogue says so in plain words rather than relying on a red button to
// carry the meaning.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, ArchiveX, AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { REMOVAL_REASONS } from "@/lib/equipment/removal";

type Asset = { id: string; assetId: string; name: string };

export function RemoveFromRegisterModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("DECOMMISSIONED");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const hint = REMOVAL_REASONS.find((r) => r.value === reason)?.hint ?? "";
  const urlParam = (asset?.assetId || "").replace(/\//g, "-");

  const submit = async () => {
    if (!asset) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${urlParam}/removal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note: note.trim() || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not remove the asset.");
        return;
      }
      toast.success(`${asset.name} is off the register. Its history is intact.`);
      onDone();
      onClose();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!asset}
      onClose={onClose}
      title="Remove from the register"
      subtitle={asset ? `${asset.assetId} · ${asset.name}` : undefined}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600 leading-relaxed">
          <span className="font-medium text-ink-900">{asset?.name}</span> leaves the register and
          stops appearing in the default view. Everything attached to it stays: its work orders,
          permits, calibration certificates and incidents are all still evidence of what happened
          while it was in service.
        </p>

        <div>
          <label className={LABEL_CLASS}>Why is it going?</label>
          <Select value={reason} onChange={setReason} className="w-full" ariaLabel="Removal reason">
            {REMOVAL_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          {hint && <p className="text-xs text-ink-500 mt-1.5">{hint}</p>}
        </div>

        <div>
          <label className={LABEL_CLASS}>
            Note {reason === "OTHER" ? "" : <span className="font-normal text-ink-500">(optional)</span>}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              reason === "OTHER"
                ? "Say what happened. Somebody will read this years from now."
                : "Anything worth recording: buyer, scrap reference, where it went."
            }
            className={`${FIELD_CLASS} resize-none`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} icon={ArchiveX}>
            Remove from register
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DeleteAssetModal({
  asset,
  onClose,
  onDone,
}: {
  asset: Asset | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmTag, setConfirmTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const urlParam = (asset?.assetId || "").replace(/\//g, "-");
  // Typing the tag is not security, it is a pause. The password is the control;
  // this is what stops the wrong row being deleted from a list of similar ones.
  const tagMatches = confirmTag.trim() === (asset?.assetId ?? "").trim();

  const close = () => {
    setPassword("");
    setConfirmTag("");
    setRefusal(null);
    onClose();
  };

  const submit = async () => {
    if (!asset) return;
    setSaving(true);
    setRefusal(null);
    try {
      const res = await fetch(`/api/equipment/${urlParam}/removal`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Shown in the dialogue rather than as a toast: the refusal explains
        // what is holding the asset and is too long to read in something that
        // dismisses itself after four seconds.
        setRefusal(d.error || "Could not delete the asset.");
        return;
      }
      toast.success(`${asset.assetId} deleted.`);
      onDone();
      close();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!asset}
      onClose={close}
      title="Delete permanently"
      subtitle={asset ? `${asset.assetId} · ${asset.name}` : undefined}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-danger-50 border border-danger-200">
          <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
          <p className="text-sm text-danger-800 leading-relaxed">
            This destroys the record. It is for an asset that should never have existed — a
            duplicate, a test row, a tag created by mistake. If the machine was real and has any
            history, remove it from the register instead.
          </p>
        </div>

        {refusal && (
          <div className="px-3 py-3 rounded-lg bg-warn-50 border border-warn-200">
            <p className="text-sm text-warn-800 leading-relaxed">{refusal}</p>
          </div>
        )}

        <div>
          <label className={LABEL_CLASS}>
            Type <span className="font-semibold text-ink-900 tabular-nums">{asset?.assetId}</span> to
            confirm
          </label>
          <input
            value={confirmTag}
            onChange={(e) => setConfirmTag(e.target.value)}
            placeholder={asset?.assetId}
            className={FIELD_CLASS}
            autoComplete="off"
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Deletion password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD_CLASS}
            autoComplete="off"
          />
          <p className="text-xs text-ink-500 mt-1.5">
            Held by management. Super Admin only, and the password on top of that.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={saving}
            disabled={!tagMatches || !password}
            icon={Trash2}
          >
            Delete permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}
