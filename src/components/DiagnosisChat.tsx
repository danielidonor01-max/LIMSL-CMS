// src/components/DiagnosisChat.tsx
// Chat-style AI diagnosis. The technician works the fault turn by turn; the
// assistant grounds every reply in the machine's evidence pack (guardrails live
// server-side). Starting a session logs a DIAGNOSIS entry to the machine
// history, so the technician explicitly opts in ("log this and proceed").
// Built responsive: reads as a real chat on a shop-floor phone and on desktop.
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles, Send, Loader2, Paperclip, X, ShieldAlert, CheckCircle2,
  CircleHelp, ClipboardCheck, ImageIcon,
} from "lucide-react";
import Button from "@/components/Button";
import Field, { FIELD_CLASS } from "@/components/Field";
import { useUserPrefs } from "@/components/PreferencesProvider";

type Step = { action: string; expected?: string; ifNot?: string };
type ChatMessage = {
  role: "user" | "assistant";
  ts: string;
  text: string;
  imageCount?: number;
  imageKeys?: string[];
  likelyCause?: string | null;
  confidence?: number | null;
  question?: string | null;
  steps?: Step[];
  safety?: string[];
  components?: { tag: string; verified: boolean }[];
  evidence?: { id: string; label: string; kind: string }[];
  insufficientEvidence?: boolean;
  resolved?: boolean;
};
type Attachment = { mimeType: string; dataBase64: string; preview: string; name: string };

const MAX_IMAGES = 3;

async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(";")) || file.type;
  return { mimeType, dataBase64: dataUrl.slice(comma + 1), preview: dataUrl, name: file.name };
}

export default function DiagnosisChat({
  assetId,
  symptom,
  resumeSessionId,
}: {
  assetId: string;
  symptom: string;
  resumeSessionId?: string | null;
}) {
  const { prefs } = useUserPrefs();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "ABANDONED">("OPEN");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stepChecks, setStepChecks] = useState<Record<number, boolean>>({});
  const [resolving, setResolving] = useState(false);
  const [resolveCause, setResolveCause] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Resume a session from a deep link (?session=…) or the history log.
  useEffect(() => {
    if (!resumeSessionId) return;
    fetch(`/api/equipment/${assetId}/diagnose/chat?session=${resumeSessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        setSessionId(d.sessionId);
        setStatus(d.status);
        setMessages(d.messages ?? []);
      });
  }, [assetId, resumeSessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, starting]);

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  })();
  const lastSteps = lastAssistantIdx >= 0 ? messages[lastAssistantIdx].steps ?? [] : [];

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_IMAGES} photos per message.`);
      return;
    }
    const picked = Array.from(files).slice(0, room).filter((f) => f.type.startsWith("image/"));
    const mapped = await Promise.all(picked.map(fileToAttachment));
    setAttachments((a) => [...a, ...mapped]);
  };

  const start = async () => {
    setStarting(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          symptom,
          images: attachments.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not start AI diagnosis.");
        return;
      }
      setSessionId(d.sessionId);
      setStatus("OPEN");
      setMessages(d.messages ?? []);
      setAttachments([]);
      setStepChecks({});
    } catch {
      toast.error("Could not start AI diagnosis.");
    } finally {
      setStarting(false);
    }
  };

  const send = async (text: string) => {
    if (!sessionId) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    setSending(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          sessionId,
          message: trimmed,
          images: attachments.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Message failed.");
        return;
      }
      setMessages(d.messages ?? []);
      setInput("");
      setAttachments([]);
      setStepChecks({});
    } catch {
      toast.error("Message failed.");
    } finally {
      setSending(false);
    }
  };

  // Turn the ticked step boxes into a natural report the model can act on.
  const reportSteps = () => {
    const done = lastSteps.filter((_, i) => stepChecks[i]).map((s) => s.action);
    const notDone = lastSteps.filter((_, i) => !stepChecks[i]).map((s) => s.action);
    const parts: string[] = [];
    if (done.length) parts.push(`I completed: ${done.join("; ")}.`);
    if (notDone.length) parts.push(`Not done / not conclusive: ${notDone.join("; ")}.`);
    const prefix = parts.join(" ");
    setInput((cur) => (cur ? `${prefix} ${cur}` : `${prefix} `));
  };

  const resolve = async () => {
    if (!sessionId || !resolveCause.trim()) return;
    const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve", sessionId, resolvedCause: resolveCause.trim() }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || "Could not close the session.");
      return;
    }
    setStatus("RESOLVED");
    setResolving(false);
    toast.success(
      d.learned === "created"
        ? "Resolved, logged to history, and learned as a new diagnostic guide."
        : d.learned === "reinforced"
          ? "Resolved, logged to history, known cause reinforced in the engine."
          : "Diagnosis resolved and logged to machine history.",
    );
  };

  // ── Pre-session gate ────────────────────────────────────────────────────────
  if (!sessionId) {
    return (
      <div className="px-6 py-6 space-y-4">
        <p className="text-sm text-ink-700 leading-relaxed">
          Work the fault through with the assistant, one step at a time. Every reply is grounded in this
          machine&apos;s guides, history, manuals and component registry, and you can attach photos of the panel
          or the component.
        </p>

        {/* Starting is not a free action: it writes to the machine's history.
            That has to be said before the button, not discovered after it. */}
        <div className="flex items-start gap-2.5 text-sm text-warn-900 bg-warn-50 border border-warn-200 rounded-lg px-4 py-3 leading-relaxed">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-warn-600" />
          <span>
            Starting logs this fault to the machine&apos;s history. The assistant is advisory: verify before
            acting, and follow PTW and LOTO.
          </span>
        </div>

        {attachments.length > 0 && (
          <AttachmentStrip
            attachments={attachments}
            onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Sparkles} loading={starting} disabled={symptom.trim().length < 3} onClick={start}>
            {starting ? "Starting…" : "Log the fault and start"}
          </Button>
          <Button variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}>
            Attach a photo
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        </div>
        {symptom.trim().length < 3 && (
          <p className="text-sm text-ink-500">Describe the fault in the box above first.</p>
        )}
      </div>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="max-h-[34rem] overflow-y-auto px-5 py-5 space-y-4 bg-ink-50">
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            m={m}
            isLastAssistant={i === lastAssistantIdx}
            stepChecks={i === lastAssistantIdx ? stepChecks : undefined}
            onToggleStep={(idx) => setStepChecks((c) => ({ ...c, [idx]: !c[idx] }))}
          />
        ))}
        {(sending || starting) && (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 className="w-4 h-4 animate-spin text-violet-500" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {status !== "OPEN" ? (
        <div className="border-t border-line px-5 py-4 bg-brand-50 text-sm text-brand-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-600" />
          {status === "RESOLVED" ? "Resolved, and logged to the machine's history." : "This session is closed."}
        </div>
      ) : (
        <div className="border-t border-line px-5 py-4 space-y-3 bg-surface">
          {/* The two things you can do besides type. They were both plain green
              links sitting under the composer at caption size, which is where
              an interface hides what it does not want you to press. */}
          <div className="flex flex-wrap items-center gap-2">
            {lastSteps.length > 0 && (
              <Button size="sm" variant="subtle" icon={ClipboardCheck} onClick={reportSteps}>
                Report the ticked checks
              </Button>
            )}
            {!resolving && (
              <Button size="sm" variant="subtle" icon={CheckCircle2} onClick={() => setResolving(true)}>
                This resolved the fault
              </Button>
            )}
          </div>

          {/* Closing the session writes the confirmed cause to the machine's
              history and teaches the engine, so it asks for the cause in a
              labelled field rather than a placeholder. */}
          {resolving && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 space-y-3">
              <Field label="Confirmed root cause" htmlFor="resolve-cause" required>
                <input
                  id="resolve-cause"
                  value={resolveCause}
                  onChange={(e) => setResolveCause(e.target.value)}
                  placeholder="What it actually turned out to be"
                  className={`${FIELD_CLASS} bg-surface`}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setResolving(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={resolve} disabled={!resolveCause.trim()} icon={CheckCircle2}>
                  Mark resolved
                </Button>
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <AttachmentStrip
              attachments={attachments}
              onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
            />
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="min-h-11 min-w-11 flex items-center justify-center border border-line hover:bg-ink-100 text-ink-500 hover:text-ink-900 rounded-lg shrink-0 transition-colors"
              title="Attach a photo"
              aria-label="Attach a photo"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Send shortcut follows the user's preference (Account → Preferences
                // → AI chat). Default: Enter is a plain new line, a stray Enter on a
                // phone must not fire a half-typed report, and Ctrl/Cmd+Enter sends.
                if (e.key !== "Enter") return;
                if (prefs.chatEnterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="Report what you observed…"
              aria-label="Your reply to the assistant"
              className={`${FIELD_CLASS} flex-1 resize-none max-h-32`}
            />
            <Button
              className="shrink-0"
              onClick={() => send(input)}
              disabled={!input.trim() && attachments.length === 0}
              loading={sending}
              icon={Send}
              title="Send"
              aria-label="Send"
            />
          </div>
          <p className="text-xs text-ink-500 text-right">
            {prefs.chatEnterToSend ? "Enter sends · Shift+Enter for a new line" : "Ctrl+Enter sends · Enter for a new line"}
            <span className="text-ink-400"> · change this in Account → Preferences</span>
          </p>
        </div>
      )}
    </div>
  );
}

function AttachmentStrip({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a, i) => (
        <div key={i} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.preview} alt={a.name} className="w-14 h-14 object-cover rounded-lg border border-line" />
          <button
            onClick={() => onRemove(i)}
            aria-label={`Remove ${a.name}`}
            className="absolute -top-2 -right-2 bg-ink-800 hover:bg-ink-900 text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({
  m,
  isLastAssistant,
  stepChecks,
  onToggleStep,
}: {
  m: ChatMessage;
  isLastAssistant: boolean;
  stepChecks?: Record<number, boolean>;
  onToggleStep: (i: number) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-brand-600 text-white rounded-xl rounded-br-lg px-4 py-2.5">
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
          {m.imageKeys && m.imageKeys.length > 0 ? (
            <div className="flex gap-1.5 mt-2">
              {m.imageKeys.map((k) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={k} href={`/api/files/${k}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/files/${k}`}
                    alt="Attached panel photo"
                    className="w-16 h-16 object-cover rounded-lg border border-brand-500"
                  />
                </a>
              ))}
            </div>
          ) : m.imageCount ? (
            <p className="text-xs text-brand-100 mt-1.5 flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" /> {m.imageCount} photo{m.imageCount > 1 ? "s" : ""} attached
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] w-full bg-surface border border-line rounded-xl rounded-bl-lg px-4 py-3.5 space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700">AI assistant</span>
          {m.confidence != null && m.confidence > 0 && (
            <span className="text-xs text-ink-500 ml-auto tabular-nums">{m.confidence}% confident</span>
          )}
        </div>

        <p className="text-sm text-ink-800 whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>

        {m.likelyCause && (
          <p className="text-sm text-ink-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 leading-relaxed">
            <span className="font-semibold text-violet-800">Working hypothesis</span> · {m.likelyCause}
          </p>
        )}

        {m.question && (
          <p className="text-sm text-info-900 bg-info-50 border border-info-200 rounded-lg px-3 py-2.5 flex items-start gap-2 leading-relaxed">
            <CircleHelp className="w-4 h-4 mt-0.5 shrink-0 text-info-600" /> {m.question}
          </p>
        )}

        {/* Safety is the one thing in this bubble a person must not skim past,
            so it is a banner rather than a row of chips among other rows of
            chips. */}
        {m.safety && m.safety.length > 0 && (
          <div className="rounded-lg bg-warn-50 border border-warn-200 px-3 py-2.5 space-y-1">
            <p className="text-xs font-semibold text-warn-900 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> Before you touch anything
            </p>
            <ul className="space-y-0.5">
              {m.safety.map((s, j) => (
                <li key={j} className="text-sm text-warn-900 leading-relaxed">{s}</li>
              ))}
            </ul>
          </div>
        )}

        {m.steps && m.steps.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-ink-600">Suggested checks</p>
            {m.steps.map((s, j) => (
              <label
                key={j}
                className={`flex items-start gap-2.5 text-sm text-ink-700 leading-relaxed ${isLastAssistant ? "cursor-pointer" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={!isLastAssistant}
                  checked={!!stepChecks?.[j]}
                  onChange={() => onToggleStep(j)}
                  className="accent-brand-600 w-4 h-4 mt-0.5 shrink-0"
                />
                <span className={stepChecks?.[j] ? "line-through text-ink-400" : ""}>
                  {s.action}
                  {s.expected && <span className="text-ink-500">, expect {s.expected}</span>}
                  {s.ifNot && <span className="text-ink-500"> (if not: {s.ifNot})</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* A tag the registry does not know is the assistant naming a part that
            may not exist on this machine, which is the failure mode worth
            catching. It says so rather than relying on a tooltip. */}
        {m.components && m.components.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.components.map((c) => (
              <span
                key={c.tag}
                className={`text-xs px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
 c.verified
 ? "bg-ink-50 border-line text-ink-700"
 : "bg-danger-500/10 border-danger-500/20 text-danger-700"
 }`}
                title={c.verified ? "In the component registry" : "Not in the component registry, unverified"}
              >
                {c.tag}
                {!c.verified && <span className="font-semibold">· unverified</span>}
              </span>
            ))}
          </div>
        )}

        {m.evidence && m.evidence.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-500">Drawn from</span>
            {m.evidence.map((ev) => (
              <span
                key={ev.id}
                className="text-xs px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-700"
                title={ev.id}
              >
                {ev.label}
              </span>
            ))}
          </div>
        )}

        {m.resolved && (
          <p className="text-sm text-brand-700 font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> The assistant believes this fault is resolved.
          </p>
        )}
      </div>
    </div>
  );
}
