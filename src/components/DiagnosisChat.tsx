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
      <div className="p-5 space-y-3">
        <p className="text-xs text-ink-600 leading-relaxed">
          Continue with a guided, back-and-forth AI diagnosis. Every reply is grounded in this machine&apos;s
          guides, history, manuals and component registry. You can attach photos of the panel or component.
        </p>
        <div className="flex items-start gap-2 text-xs text-warn-800 bg-warn-50 border border-warn-200 rounded-lg px-3 py-2">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Starting logs this fault to the machine&apos;s history log. AI output is advisory, verify before acting and follow PTW/LOTO.</span>
        </div>
        {attachments.length > 0 && <AttachmentStrip attachments={attachments} onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Sparkles} loading={starting} disabled={symptom.trim().length < 3} onClick={start}>
            {starting ? "Starting…" : "Log fault & start AI diagnosis"}
          </Button>
          <Button variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}>
            Attach photo
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          {symptom.trim().length < 3 && <span className="text-xs text-ink-400">Enter a symptom above first.</span>}
        </div>
      </div>
    );
  }

  // ── Active session ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="max-h-[32rem] overflow-y-auto px-4 py-4 space-y-3 bg-ink-50/40">
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
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" /> Analyzing…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {status !== "OPEN" ? (
        <div className="border-t border-ink-200 px-4 py-3 bg-brand-50/60 text-xs text-brand-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {status === "RESOLVED" ? "Resolved, logged to machine history." : "Session closed."}
        </div>
      ) : (
        <div className="border-t border-ink-200 p-3 space-y-2 bg-white">
          {lastSteps.length > 0 && (
            <button
              onClick={reportSteps}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> Report ticked steps
            </button>
          )}
          {attachments.length > 0 && <AttachmentStrip attachments={attachments} onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))} />}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center border border-ink-200 hover:bg-ink-50 text-ink-500 rounded-lg shrink-0"
              title="Attach photo"
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
              className="flex-1 resize-none max-h-32 px-3 py-2.5 bg-ink-50 border border-ink-200 rounded-lg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15"
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
          <p className="text-xs text-ink-400 text-right">
            {prefs.chatEnterToSend ? "Enter sends · Shift+Enter for a new line" : "Ctrl+Enter sends · Enter for a new line"}
            <span className="text-ink-300"> · change in Account → Preferences</span>
          </p>

          {resolving ? (
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                value={resolveCause}
                onChange={(e) => setResolveCause(e.target.value)}
                placeholder="Confirmed root cause…"
                className="flex-1 px-3 py-2 bg-ink-50 border border-ink-200 rounded-lg text-sm focus:outline-none focus:border-brand-500/40"
              />
              <div className="flex gap-2">
                <Button onClick={resolve} disabled={!resolveCause.trim()}>
                  Mark resolved
                </Button>
                <button onClick={() => setResolving(false)} className="px-3 py-2 border border-ink-200 text-ink-600 rounded-lg text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setResolving(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> This resolved the fault
            </button>
          )}
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
          <img src={a.preview} alt={a.name} className="w-14 h-14 object-cover rounded-lg border border-ink-200" />
          <button
            onClick={() => onRemove(i)}
            className="absolute -top-1.5 -right-1.5 bg-ink-800 text-white rounded-full w-4 h-4 flex items-center justify-center"
          >
            <X className="w-2.5 h-2.5" />
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
        <div className="max-w-[85%] bg-brand-600 text-white rounded-xl rounded-br-sm px-3.5 py-2">
          <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
          {m.imageKeys && m.imageKeys.length > 0 ? (
            <div className="flex gap-1.5 mt-1.5">
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
            <p className="text-xs text-brand-100 mt-1 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" /> {m.imageCount} photo{m.imageCount > 1 ? "s" : ""} attached
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] bg-white border border-ink-200 rounded-xl rounded-bl-sm px-3.5 py-2.5 space-y-2 w-full">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-violet-500" />
          <span className="text-xs font-semibold text-violet-600">AI assistant</span>
          {m.confidence != null && m.confidence > 0 && (
            <span className="text-xs text-ink-400 ml-auto">{m.confidence}% confident</span>
          )}
        </div>

        <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">{m.text}</p>

        {m.likelyCause && (
          <p className="text-xs text-ink-600 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
            <span className="font-semibold text-violet-700">Working hypothesis:</span> {m.likelyCause}
          </p>
        )}

        {m.question && (
          <p className="text-xs text-info-800 bg-info-50 border border-info-100 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <CircleHelp className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {m.question}
          </p>
        )}

        {m.safety && m.safety.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.safety.map((s, j) => (
              <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-warn-500/10 border border-warn-500/20 text-warn-800 font-semibold">
                ⚠ {s}
              </span>
            ))}
          </div>
        )}

        {m.steps && m.steps.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink-500">Suggested checks</p>
            {m.steps.map((s, j) => (
              <label
                key={j}
                className={`flex items-start gap-2 text-xs text-ink-700 ${isLastAssistant ? "cursor-pointer" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={!isLastAssistant}
                  checked={!!stepChecks?.[j]}
                  onChange={() => onToggleStep(j)}
                  className="accent-brand-600 w-3.5 h-3.5 mt-0.5 shrink-0"
                />
                <span className={stepChecks?.[j] ? "line-through text-ink-400" : ""}>
                  {s.action}
                  {s.expected && <span className="text-ink-500">, expect: {s.expected}</span>}
                  {s.ifNot && <span className="text-ink-400"> (if not: {s.ifNot})</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {m.components && m.components.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.components.map((c) => (
              <span
                key={c.tag}
                className={`text-xs px-2 py-0.5 rounded-lg border ${
 c.verified ? "bg-ink-50 border-ink-200 text-ink-700" : "bg-danger-50 border-danger-200 text-danger-700"
 }`}
                title={c.verified ? "In the component registry" : "NOT in the component registry, unverified"}
              >
                {c.tag}
                {!c.verified && " ⚠"}
              </span>
            ))}
          </div>
        )}

        {m.evidence && m.evidence.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.evidence.map((ev) => (
              <span key={ev.id} className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700" title={ev.id}>
                {ev.label}
              </span>
            ))}
          </div>
        )}

        {m.resolved && (
          <p className="text-xs text-brand-700 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> The assistant believes this fault is resolved.
          </p>
        )}
      </div>
    </div>
  );
}
