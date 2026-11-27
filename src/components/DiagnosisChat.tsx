// src/components/DiagnosisChat.tsx
// Chat-style AI diagnosis. The technician works the fault turn by turn; the
// assistant grounds every reply in the machine's evidence pack (guardrails live
// server-side). Starting a session logs a DIAGNOSIS entry to the machine
// history, so the technician explicitly opts in ("log this and proceed").
// Built responsive: reads as a real chat on a shop-floor phone and on desktop.
//
// The pieces are the Rare UI AI kit in this app's tokens (16 Nov 2026): the
// status line while the assistant works, the reply that develops word by
// word, the prompt box, and the checks as a task list. On desktop the checks
// sit beside the chat in the page's side column (`checksRail`), so the list
// you are working through stays in view while the conversation scrolls.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m as Motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Sparkles, Paperclip, X, ShieldAlert, CheckCircle2,
  CircleHelp, ClipboardCheck, ImageIcon, ListChecks,
} from "lucide-react";
import Link from "next/link";
import Button from "@/components/Button";
import SessionClose, { type CloseResult } from "@/components/SessionClose";
import { isOutcome, OUTCOMES } from "@/lib/maintenance/troubleshooting";
import { useUserPrefs } from "@/components/PreferencesProvider";
import AiStatus, { type AiStatusState } from "@/components/ai/AiStatus";
import PromptBox from "@/components/ai/PromptBox";
import StreamingResponse from "@/components/ai/StreamingResponse";
import TaskList from "@/components/ai/TaskList";

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

const PLACEHOLDERS = [
  "Report what you observed…",
  "What did the meter read?",
  "Which checks did you do?",
  "Attach a photo of the panel…",
];

// What the status line says while a reply is on its way. The service reads
// the machine's evidence pack first and then asks the model, so the first
// label is what is actually happening; the rest follow the clock.
const PHASES: { after: number; state: AiStatusState; label: string }[] = [
  { after: 0, state: "researching", label: "Reading this machine's records" },
  { after: 2500, state: "thinking", label: "Thinking" },
  { after: 9000, state: "writing", label: "Writing the reply" },
];

const stepDetail = (s: Step) =>
  [s.expected && `Expect ${s.expected}`, s.ifNot && `If not: ${s.ifNot}`].filter(Boolean).join(". ") || undefined;

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
  equipmentId,
  symptom,
  resumeSessionId,
  checksRail,
  breakdown: startBreakdown = null,
  canWrite = true,
}: {
  assetId: string;
  equipmentId: string;
  symptom: string;
  resumeSessionId?: string | null;
  // Desktop only: an element in the page's side column the checks render into.
  checksRail?: HTMLElement | null;
  /** The open breakdown being troubleshot, when the session starts from one. */
  breakdown?: { id: string; cmrfNumber: string } | null;
  /** Whether this person may start, continue and close sessions (TROUBLESHOOT_ROLES). */
  canWrite?: boolean;
}) {
  const { prefs } = useUserPrefs();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "ABANDONED">("OPEN");
  const [breakdown, setBreakdown] = useState<{ id: string; cmrfNumber: string } | null>(startBreakdown);
  const [closed, setClosed] = useState<CloseResult | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stepChecks, setStepChecks] = useState<Record<number, boolean>>({});
  const [resolving, setResolving] = useState(false);
  // Replies from this index on arrived while the page was open, so they are
  // revealed word by word. Anything loaded from history shows at once.
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  // How long the latest reply took, for "Worked for 7s" above it.
  const [worked, setWorked] = useState<{ index: number; seconds: number } | null>(null);
  const [phase, setPhase] = useState(0);
  const askedAt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const waiting = sending || starting;

  // Resume a session from a deep link (?session=…) or the history log.
  useEffect(() => {
    if (!resumeSessionId) return;
    fetch(`/api/equipment/${assetId}/diagnose/chat?session=${resumeSessionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        setSessionId(d.sessionId);
        setStatus(d.status);
        setOutcome(d.outcome ?? null);
        if (d.breakdown) setBreakdown(d.breakdown);
        setMessages(d.messages ?? []);
      });
  }, [assetId, resumeSessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, starting]);

  useEffect(() => {
    if (!waiting) return;
    const timers = PHASES.slice(1).map((p, i) => window.setTimeout(() => setPhase(i + 1), p.after));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [waiting]);

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  })();
  const lastSteps = lastAssistantIdx >= 0 ? messages[lastAssistantIdx].steps ?? [] : [];
  const ticked = lastSteps.filter((_, i) => stepChecks[i]).length;

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

  const received = (next: ChatMessage[], before: number) => {
    setFreshFrom(before);
    let idx = -1;
    for (let i = next.length - 1; i >= 0; i--) if (next[i].role === "assistant") { idx = i; break; }
    if (idx >= before) setWorked({ index: idx, seconds: Math.round((Date.now() - askedAt.current) / 1000) });
    setMessages(next);
  };

  const start = async () => {
    setPhase(0);
    setStarting(true);
    askedAt.current = Date.now();
    try {
      const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          symptom,
          correctiveId: breakdown?.id,
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
      received(d.messages ?? [], 0);
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
    const before = messages.length;
    const sentImages = attachments;
    // The prompt box lifts the words out as it sends, so the field clears now
    // and comes back only if the message did not go.
    setInput("");
    setAttachments([]);
    setPhase(0);
    setSending(true);
    askedAt.current = Date.now();
    try {
      const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "message",
          sessionId,
          message: trimmed,
          images: sentImages.map(({ mimeType, dataBase64 }) => ({ mimeType, dataBase64 })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Message failed.");
        setInput(text);
        setAttachments(sentImages);
        return;
      }
      received(d.messages ?? [], before);
      setStepChecks({});
    } catch {
      toast.error("Message failed.");
      setInput(text);
      setAttachments(sentImages);
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

  const toggleStep = useCallback((idx: number, done: boolean) => {
    setStepChecks((c) => ({ ...c, [idx]: done }));
  }, []);

  const onClosed = (r: CloseResult) => {
    setStatus(r.status);
    setOutcome(r.outcome);
    setClosed(r);
    if (r.breakdown) setBreakdown(r.breakdown);
    setResolving(false);
    const where = r.breakdown ? (r.raisedBreakdown ? ` ${r.breakdown.cmrfNumber} raised.` : ` Added to ${r.breakdown.cmrfNumber}.`) : "";
    toast.success(
      (r.outcome === "CAUSE_FOUND"
        ? r.learned === "created"
          ? "Cause recorded and learned as a new guide."
          : "Cause recorded."
        : r.outcome === "ABANDONED"
          ? "Session stopped."
          : "Session closed.") + where,
    );
  };

  const abandon = async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abandon", sessionId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(d.error || "Could not stop the session.");
    onClosed(d as CloseResult);
  };

  // ── Pre-session gate ────────────────────────────────────────────────────────
  if (!sessionId && !canWrite) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-ink-600 leading-relaxed">
          Troubleshooting is started by the maintenance team and management. You can read every past session from the
          Troubleshooting page.
        </p>
      </div>
    );
  }
  if (!sessionId) {
    return (
      <div className="px-6 py-6 space-y-4">
        {breakdown && (
          <p className="text-sm text-ink-800">
            Troubleshooting <span className="font-semibold">{breakdown.cmrfNumber}</span>. The session and whatever it
            finds go on that breakdown.
          </p>
        )}
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

        {starting ? (
          <AiStatus state={PHASES[phase].state} label={PHASES[phase].label} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Sparkles} disabled={symptom.trim().length < 3} onClick={start}>
              Log the fault and start
            </Button>
            <Button variant="secondary" icon={Paperclip} onClick={() => fileRef.current?.click()}>
              Attach a photo
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>
        )}
        {symptom.trim().length < 3 && (
          <p className="text-sm text-ink-500">Describe the fault in the box above first.</p>
        )}
      </div>
    );
  }

  const checks = lastSteps.map((s, i) => ({ id: String(i), label: s.action, detail: stepDetail(s), done: !!stepChecks[i] }));
  const open = status === "OPEN";

  // ── Active session ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col">
      <div className="max-h-[38rem] overflow-y-auto px-4 sm:px-5 py-5 space-y-5 bg-ink-50">
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            m={m}
            fresh={i >= freshFrom}
            workedSeconds={worked?.index === i ? worked.seconds : undefined}
            isLastAssistant={i === lastAssistantIdx && open}
            checksOnRail={!!checksRail}
            checks={i === lastAssistantIdx ? checks : undefined}
            onToggleStep={toggleStep}
          />
        ))}
        <AnimatePresence>
          {waiting && (
            <Motion.div
              key="status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pl-1"
            >
              <AiStatus state={PHASES[phase].state} label={PHASES[phase].label} />
            </Motion.div>
          )}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      {!open ? (
        <div className="border-t border-line px-5 py-4 bg-brand-50 text-sm text-brand-900 flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-brand-600" />
          <span>
            {outcome && isOutcome(outcome)
              ? `${OUTCOMES[outcome].label}. Logged to the machine's history.`
              : status === "RESOLVED"
                ? "Resolved, and logged to the machine's history."
                : "This session is closed."}
          </span>
          {breakdown && (
            <Link href={`/corrective/${breakdown.id}`} className="font-semibold text-brand-800 hover:underline">
              {outcome === "CAUSE_FOUND" || closed?.outcome === "CAUSE_FOUND"
                ? `Open ${breakdown.cmrfNumber} to verify the root cause`
                : `Open ${breakdown.cmrfNumber}`}
            </Link>
          )}
        </div>
      ) : !canWrite ? (
        <div className="border-t border-line px-5 py-4 text-sm text-ink-600">
          This session is still open. It is continued by the maintenance team.
        </div>
      ) : (
        <div className="border-t border-line px-4 sm:px-5 py-4 space-y-3 bg-surface">
          {/* The two things you can do besides type. On desktop the report
              button lives with the checks in the side column. */}
          <div className="flex flex-wrap items-center gap-2">
            {lastSteps.length > 0 && (
              <Button
                size="sm"
                variant="subtle"
                icon={ClipboardCheck}
                onClick={reportSteps}
                className={checksRail ? "lg:hidden" : undefined}
              >
                Report the ticked checks
              </Button>
            )}
            {!resolving && (
              <>
                <Button size="sm" variant="subtle" icon={CheckCircle2} onClick={() => setResolving(true)}>
                  Finish troubleshooting
                </Button>
                <Button size="sm" variant="ghost" onClick={abandon}>
                  Stop without an answer
                </Button>
              </>
            )}
            {breakdown && (
              <span className="text-xs text-ink-500 ml-auto">
                On <Link href={`/corrective/${breakdown.id}`} className="font-semibold text-ink-700 hover:underline">{breakdown.cmrfNumber}</Link>
              </span>
            )}
          </div>

          {/* How it ended. A cause that needs a repair goes on a breakdown:
              this one's, an open one on the machine, or a new one. */}
          {resolving && sessionId && (
            <SessionClose
              assetId={assetId}
              equipmentId={equipmentId}
              sessionId={sessionId}
              breakdown={breakdown}
              suggestedCause={lastAssistantIdx >= 0 ? messages[lastAssistantIdx].likelyCause ?? null : null}
              onCancel={() => setResolving(false)}
              onClosed={onClosed}
            />
          )}

          <PromptBox
            value={input}
            onValueChange={setInput}
            onSubmit={send}
            busy={sending}
            canSendEmpty={attachments.length > 0}
            enterToSend={prefs.chatEnterToSend}
            placeholder={PLACEHOLDERS}
            top={
              attachments.length > 0 ? (
                <AttachmentStrip
                  attachments={attachments}
                  onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
                />
              ) : undefined
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex size-10 items-center justify-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title="Attach a photo"
                  aria-label="Attach a photo"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
              </>
            }
            hint={prefs.chatEnterToSend ? "Enter sends" : "Ctrl+Enter sends"}
          />
          <p className="text-xs text-ink-400 text-right">
            {prefs.chatEnterToSend ? "Shift+Enter for a new line" : "Enter for a new line"} · change this in Account →
            Preferences
          </p>
        </div>
      )}

      {/* Desktop: the checks beside the chat, in the page's side column. */}
      {checksRail &&
        createPortal(
          <ChecksPanel
            checks={checks}
            ticked={ticked}
            open={open}
            onToggle={(id, done) => toggleStep(Number(id), done)}
            onReport={reportSteps}
          />,
          checksRail,
        )}
    </div>
  );
}

function ChecksPanel({
  checks,
  ticked,
  open,
  onToggle,
  onReport,
}: {
  checks: { id: string; label: string; detail?: string; done: boolean }[];
  ticked: number;
  open: boolean;
  onToggle: (id: string, done: boolean) => void;
  onReport: () => void;
}) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand-600 shrink-0" /> Checks to work through
        </h3>
        {checks.length > 0 && (
          <span className="text-xs text-ink-500 tabular-nums">
            {ticked} of {checks.length} done
          </span>
        )}
      </div>
      <div className="px-4 py-4 space-y-3">
        {checks.length === 0 ? (
          <p className="text-sm text-ink-500 leading-relaxed">
            The checks the assistant suggests land here, so you can tick them off while the conversation scrolls.
          </p>
        ) : (
          // Keyed on the step set, so a new reply starts a fresh list.
          <TaskList
            key={checks.map((c) => c.label).join("|")}
            tasks={checks}
            onToggle={onToggle}
            disabled={!open}
          />
        )}
        {open && checks.length > 0 && (
          <Button size="sm" variant="secondary" icon={ClipboardCheck} fullWidth onClick={onReport}>
            Report the ticked checks
          </Button>
        )}
      </div>
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
  fresh,
  workedSeconds,
  isLastAssistant,
  checksOnRail,
  checks,
  onToggleStep,
}: {
  m: ChatMessage;
  fresh: boolean;
  workedSeconds?: number;
  isLastAssistant: boolean;
  checksOnRail: boolean;
  checks?: { id: string; label: string; detail?: string; done: boolean }[];
  onToggleStep: (i: number, done: boolean) => void;
}) {
  const reduced = !!useReducedMotion();
  // The structured parts of a fresh reply wait for its words, so the eye
  // reads the answer first and the checks arrive after it.
  const [revealed, setRevealed] = useState(!fresh);
  const onSettled = useCallback(() => setRevealed(true), []);

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

  const steps = m.steps ?? [];
  const inlineChecks = checks ?? steps.map((s, j) => ({ id: String(j), label: s.action, detail: stepDetail(s), done: false }));

  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] w-full space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1">
          <span className="flex size-6 items-center justify-center rounded-full bg-violet-500/10">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          </span>
          <span className="text-xs font-semibold text-violet-700 whitespace-nowrap">AI assistant</span>
          {workedSeconds !== undefined && (
            <AiStatus state="done" elapsed={workedSeconds} className="h-6 text-xs whitespace-nowrap" />
          )}
          {m.confidence != null && m.confidence > 0 && (
            <span className="text-xs text-ink-500 ml-auto tabular-nums whitespace-nowrap">{m.confidence}% confident</span>
          )}
        </div>

        <div className="bg-surface border border-line rounded-xl rounded-tl-lg px-4 py-3.5 space-y-3">
          <StreamingResponse text={m.text} animate={fresh} onSettled={onSettled} />

          <AnimatePresence initial={false}>
            {revealed && (
              <Motion.div
                key="extras"
                initial={reduced ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", duration: 0.45, bounce: 0.1 }}
                className="space-y-3"
              >
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

                {/* Safety is the one thing in this reply a person must not skim
                    past, so it is a banner rather than a row of chips. */}
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

                {/* The checks. The live ones are a task list you tick off; on
                    desktop that list sits in the side column instead, and the
                    reply just says where. Earlier replies keep theirs for
                    reference, read-only. */}
                {steps.length > 0 &&
                  (isLastAssistant ? (
                    <>
                      {checksOnRail && (
                        <p className="hidden lg:flex text-sm text-ink-600 items-center gap-1.5">
                          <ListChecks className="w-4 h-4 text-brand-600 shrink-0" />
                          {steps.length} suggested check{steps.length > 1 ? "s" : ""}, in the list beside the chat.
                        </p>
                      )}
                      <div className={checksOnRail ? "lg:hidden space-y-1.5" : "space-y-1.5"}>
                        <p className="text-xs font-semibold text-ink-600">Suggested checks</p>
                        <TaskList
                          key={steps.map((s) => s.action).join("|")}
                          tasks={inlineChecks}
                          onToggle={(id, done) => onToggleStep(Number(id), done)}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-ink-600">Suggested checks</p>
                      <ul className="space-y-1">
                        {steps.map((s, j) => (
                          <li key={j} className="text-sm text-ink-600 leading-relaxed flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" />
                            <span>
                              {s.action}
                              {s.expected && <span className="text-ink-500">, expect {s.expected}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                {/* A tag the registry does not know is the assistant naming a
                    part that may not exist on this machine, which is the
                    failure mode worth catching. It says so outright. */}
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
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
