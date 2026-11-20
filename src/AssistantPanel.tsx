import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  ASSISTANT_SUGGESTIONS,
  askAssistant,
  type AssistantItem,
  type AssistantReply,
  type RequestDraft,
} from "./ai4";

export interface AssistantMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  reply?: AssistantReply;
  failed?: boolean;
}

/**
 * AI #4 chat. Answers come only from records the user can already see; every
 * action (viewing, requesting, submitting) happens through the normal screens
 * after an explicit click, so the assistant never changes data by itself.
 */
export function AssistantPanel({
  messages,
  setMessages,
  canRequest,
  onViewItem,
  onRequestItem,
  onOpenDraft,
  onOpenWorkflows,
}: {
  messages: AssistantMessage[];
  setMessages: (update: (m: AssistantMessage[]) => AssistantMessage[]) => void;
  canRequest: boolean;
  onViewItem: (item: AssistantItem) => void;
  onRequestItem: (item: AssistantItem) => void;
  onOpenDraft: (draft: RequestDraft) => void;
  onOpenWorkflows: () => void;
}) {
  const [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null),
    inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const id = Date.now();
    setMessages((m) => [...m, { id, role: "user", text: q }]);
    setQuestion("");
    setBusy(true);
    try {
      const reply = await askAssistant(api.invokeFunction, q);
      setMessages((m) => [
        ...m,
        { id: id + 1, role: "assistant", text: reply.answer, reply },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: id + 1,
          role: "assistant",
          text: e instanceof Error ? e.message : String(e),
          failed: true,
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(question);
  };

  return (
    <section aria-label="Campus assistant" className="assistant-panel">
      <div className="results-heading">
        <h2>Campus assistant</h2>
        {messages.length > 0 && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => setMessages(() => [])}
            disabled={busy}
          >
            Clear chat
          </button>
        )}
      </div>
      <p className="assistant-note">
        Ask about available resources, your requests, or describe what you need.
        Answers use only records you can already see. The assistant can't
        approve, reserve or transfer anything; you stay in control.
      </p>

      <div className="assistant-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="assistant-suggestions">
            <p>Try asking:</p>
            {ASSISTANT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="assistant-chip"
                onClick={() => void send(s)}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`assistant-message ${m.role}${m.failed ? " failed" : ""}`}
          >
            <p role={m.failed ? "alert" : undefined}>{m.text}</p>
            {m.reply && (
              <ReplyDetails
                reply={m.reply}
                canRequest={canRequest}
                onViewItem={onViewItem}
                onRequestItem={onRequestItem}
                onOpenDraft={onOpenDraft}
                onOpenWorkflows={onOpenWorkflows}
              />
            )}
            {m.failed && (
              <div className="workflow-card-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={onOpenWorkflows}
                >
                  Open Requests and transfers
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="assistant-message assistant pending" role="status">
            <p>Checking your records…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="assistant-question" className="visually-hidden">
          Ask the assistant
        </label>
        <input
          id="assistant-question"
          ref={inputRef}
          value={question}
          maxLength={500}
          placeholder="e.g. Any projectors in Engineering?"
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
          autoComplete="off"
        />
        <button className="button" disabled={busy || !question.trim()}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
    </section>
  );
}

function ReplyDetails({
  reply,
  canRequest,
  onViewItem,
  onRequestItem,
  onOpenDraft,
  onOpenWorkflows,
}: {
  reply: AssistantReply;
  canRequest: boolean;
  onViewItem: (item: AssistantItem) => void;
  onRequestItem: (item: AssistantItem) => void;
  onOpenDraft: (draft: RequestDraft) => void;
  onOpenWorkflows: () => void;
}) {
  return (
    <>
      {reply.items.length > 0 && (
        <ul className="assistant-records" aria-label="Matching resources">
          {reply.items.map((item) => (
            <li key={item.portionId} className="workflow-card">
              <strong>{item.name}</strong>
              <span>
                {item.categoryName || "Uncategorized"} · {item.condition} ·{" "}
                {item.qty} available
              </span>
              <span>
                {item.departmentName} · {item.location}
              </span>
              <div className="workflow-card-actions">
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() => onViewItem(item)}
                >
                  View
                </button>
                {canRequest && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => onRequestItem(item)}
                  >
                    Request this
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reply.requests.length > 0 && (
        <ul className="assistant-records" aria-label="Your requests">
          {reply.requests.map((r) => (
            <li key={r.requestId} className="workflow-card">
              <strong>{r.purpose}</strong>
              <span>
                {r.status} · {r.remainingQty} of {r.requestedQty} still needed ·
                due {r.requiredDate}
              </span>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="button secondary small"
              onClick={onOpenWorkflows}
            >
              Open Requests and transfers
            </button>
          </li>
        </ul>
      )}
      {reply.draft && canRequest && (
        <div className="workflow-card assistant-draft">
          <strong>Draft request (not submitted)</strong>
          <span>
            {reply.draft.qty} ×{" "}
            {reply.draft.categoryName || "choose a category"} ·{" "}
            {reply.draft.urgency} urgency
          </span>
          <span>{reply.draft.purpose}</span>
          <div className="workflow-card-actions">
            <button
              type="button"
              className="button small"
              onClick={() => onOpenDraft(reply.draft!)}
            >
              Review in request form
            </button>
          </div>
        </div>
      )}
      {reply.intent === "workflow_action" && (
        <div className="workflow-card-actions">
          <button
            type="button"
            className="button secondary small"
            onClick={onOpenWorkflows}
          >
            Go to Requests and transfers
          </button>
        </div>
      )}
    </>
  );
}
