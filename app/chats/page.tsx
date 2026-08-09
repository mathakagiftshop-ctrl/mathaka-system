"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileText,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Package,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  Video,
  WandSparkles,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Connection = {
  status: string;
  phone: string | null;
};

type Conversation = {
  id: string;
  displayName: string | null;
  phone: string | null;
  contactKind: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  textMessageCount: number;
};

type SelectedConversation = Pick<Conversation, "id" | "displayName" | "phone" | "textMessageCount">;

type ChatMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  mediaMimeType: string | null;
  sentAt: string;
};

type OrderDraft = {
  id: string;
  status: "draft" | "reviewed" | "confirmed" | "discarded";
  invoiceId: number | null;
  snapshot: {
    sender?: { name?: string | null; phone?: string | null; country?: string | null };
    recipient?: { name?: string | null; phone?: string | null };
    occasion?: string | null;
    delivery?: { date?: string | null; time?: string | null; address?: string | null; district?: string | null };
    items?: Array<{ category?: string; description?: string }>;
    agreedPrice?: { amount?: number | null; currency?: string | null };
    receipt?: { amount?: number | null; currency?: string | null; date?: string | null; reference?: string | null };
    specialRequest?: string | null;
    fulfilmentMode?: "self" | "partner" | "hybrid" | null;
  };
  missingFields: string[];
  confidence: Record<string, number>;
  sourceMessageCount: number;
  updatedAt: string;
  revision: number;
};

type DraftSnapshot = OrderDraft["snapshot"];

type ExtractionState = {
  status: "idle" | "pending" | "processing" | "failed";
  error: string | null;
};

type ChatsResponse = {
  connection: Connection;
  conversations: Conversation[];
  selectedConversation: SelectedConversation | null;
  messages: ChatMessage[];
  draft?: OrderDraft | null;
  extraction?: ExtractionState;
};

const pollIntervalMs = 5_000;

function personName(conversation: Pick<Conversation, "displayName" | "phone">) {
  return conversation.displayName?.trim() || conversation.phone?.trim() || "New WhatsApp contact";
}

function initials(conversation: Pick<Conversation, "displayName" | "phone">) {
  const label = personName(conversation);
  const parts = label.replace(/^\+/, "").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "WA";
}

function validDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function listTime(value: string | null) {
  const date = validDate(value);
  if (!date) return "New";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function messageTime(value: string) {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)
    : "";
}

function dayLabel(value: string) {
  const date = validDate(value);
  if (!date) return "Messages";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "long" }).format(date);
}

function mediaLabel(mimeType: string) {
  if (mimeType.startsWith("image/")) return { label: "Photo", icon: ImageIcon };
  if (mimeType.startsWith("video/")) return { label: "Video", icon: Video };
  return { label: "Attachment", icon: FileText };
}

function readableField(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function confidenceLabel(confidence: Record<string, number>) {
  const values = Object.values(confidence).filter((value) => Number.isFinite(value));
  if (!values.length) return "Confidence not available";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average >= 0.8) return "High overall confidence";
  if (average >= 0.55) return "Mixed confidence — check marked facts";
  return "Low confidence — review closely";
}

export default function ChatsPage() {
  const router = useRouter();
  const [data, setData] = useState<ChatsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [aiAction, setAiAction] = useState<"extract" | "confirm" | "discard" | null>(null);
  const [aiError, setAiError] = useState("");
  const [celebrationBusy, setCelebrationBusy] = useState(false);
  const [celebrationError, setCelebrationError] = useState("");
  const [editedSnapshot, setEditedSnapshot] = useState<DraftSnapshot | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "stale" | "error">("idle");
  const [draftSaveNote, setDraftSaveNote] = useState("");
  const requestNumber = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const conversationId = new URLSearchParams(window.location.search).get("conversation");
      if (conversationId) {
        setSelectedId(conversationId);
        setMobileThreadOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadChats = useCallback(async (background = false) => {
    const requestId = ++requestNumber.current;
    if (background) setRefreshing(true);
    try {
      const query = selectedId ? `?conversation=${encodeURIComponent(selectedId)}` : "";
      const response = await fetch(`/api/chats${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to read chats." : "Chats could not be loaded.");
      const payload = (await response.json()) as ChatsResponse;
      if (requestId !== requestNumber.current) return;
      setData(payload);
      setError("");
      if (!selectedId) {
        setSelectedId(payload.selectedConversation?.id || payload.conversations[0]?.id || null);
      }
    } catch (caught) {
      if (requestId !== requestNumber.current) return;
      setError(caught instanceof Error ? caught.message : "Chats could not be loaded.");
    } finally {
      if (requestId === requestNumber.current) {
        setInitialLoading(false);
        setThreadLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedId]);

  useEffect(() => {
    const firstLoad = window.setTimeout(() => void loadChats(false), 0);
    const poller = window.setInterval(() => void loadChats(true), pollIntervalMs);
    return () => {
      window.clearTimeout(firstLoad);
      window.clearInterval(poller);
    };
  }, [loadChats]);

  const orderedMessages = useMemo(
    () => [...(data?.messages ?? [])].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
    [data?.messages],
  );

  useEffect(() => {
    if (threadLoading) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [orderedMessages.length, selectedId, threadLoading]);

  const selected = data?.selectedConversation?.id === selectedId
    ? data.selectedConversation
    : data?.conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const connected = data?.connection.status.toLowerCase() === "connected";
  const selectedPayloadLoaded = data?.selectedConversation?.id === selectedId;
  const orderDraft = selectedPayloadLoaded ? data?.draft ?? null : null;
  const extraction = selectedPayloadLoaded
    ? data?.extraction ?? { status: "idle" as const, error: null }
    : { status: "idle" as const, error: null };
  const extractionBusy = extraction.status === "pending" || extraction.status === "processing" || aiAction === "extract";
  const hasExtractableText = Boolean(selected?.textMessageCount);

  useEffect(() => {
    if (!orderDraft || draftSaveState === "dirty" || draftSaveState === "saving") return;
    const timer = window.setTimeout(() => {
      setEditedSnapshot(structuredClone(orderDraft.snapshot));
      setDraftSaveState("idle");
      setDraftSaveNote("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orderDraft, draftSaveState]);

  function chooseConversation(id: string) {
    if (id !== selectedId) {
      setThreadLoading(true);
      setSendNote("");
      setReplyDraft("");
      setReviewOpen(false);
      setAiError("");
      setCelebrationError("");
      setEditedSnapshot(null);
      setDraftSaveState("idle");
      setDraftSaveNote("");
      setSelectedId(id);
    }
    setMobileThreadOpen(true);
    window.setTimeout(() => textareaRef.current?.focus(), 120);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const body = replyDraft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    setSendNote("");
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "WhatsApp is not connected yet." : "That reply could not be queued.");
      setReplyDraft("");
      setSendNote("Reply queued for delivery");
      await loadChats(true);
      textareaRef.current?.focus();
    } catch (caught) {
      setSendNote(caught instanceof Error ? caught.message : "That reply could not be queued.");
    } finally {
      setSending(false);
    }
  }

  async function extractOrder() {
    if (!selectedId || extractionBusy) return;
    setReviewOpen(true);
    setAiAction("extract");
    setAiError("");
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedId)}/extract`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The conversation could not be analyzed right now.");
      }
      await loadChats(true);
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "The conversation could not be analyzed right now.");
    } finally {
      setAiAction(null);
    }
  }

  async function updateOrderDraft(action: "confirm" | "discard") {
    if (!selectedId || !orderDraft || aiAction) return;
    setAiAction(action);
    setAiError("");
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedId)}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedRevision: orderDraft.revision }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || (action === "confirm" ? "The details could not be confirmed." : "The draft could not be discarded."));
      await loadChats(true);
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setAiAction(null);
    }
  }

  async function saveOrderDraft() {
    if (!selectedId || !orderDraft || !editedSnapshot || draftSaveState === "saving") return;
    setDraftSaveState("saving");
    setDraftSaveNote("");
    let stale = false;
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedId)}/draft`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: editedSnapshot, expectedRevision: orderDraft.revision }),
      });
      const payload = await response.json().catch(() => null) as { draft?: OrderDraft; error?: string } | null;
      if (response.status === 409) {
        stale = true;
        setDraftSaveState("stale");
        throw new Error(payload?.error || "This draft changed after you opened it. Reload the latest version before saving.");
      }
      if (!response.ok || !payload?.draft) throw new Error(payload?.error || "Your corrections could not be saved.");
      setData((current) => current ? { ...current, draft: payload.draft } : current);
      setEditedSnapshot(structuredClone(payload.draft.snapshot));
      setDraftSaveState("saved");
      setDraftSaveNote("Corrections saved to the order card.");
    } catch (caught) {
      if (!stale) setDraftSaveState("error");
      setDraftSaveNote(caught instanceof Error ? caught.message : "Your corrections could not be saved.");
    }
  }

  function changeDraft(next: DraftSnapshot) {
    setEditedSnapshot(next);
    setDraftSaveState("dirty");
    setDraftSaveNote("Unsaved corrections — save before confirming.");
  }

  async function createCelebration() {
    if (!selectedId || orderDraft?.status !== "confirmed" || orderDraft.invoiceId != null || celebrationBusy) return;
    setCelebrationBusy(true);
    setCelebrationError("");
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(selectedId)}/create-celebration`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { orderId?: number; alreadyCreated?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The celebration could not be created. Please try again.");
      if (!payload?.orderId || !Number.isFinite(payload.orderId)) throw new Error("The celebration was created, but its journey could not be opened.");
      router.push(`/celebrations/${payload.orderId}`);
    } catch (caught) {
      setCelebrationError(caught instanceof Error ? caught.message : "The celebration could not be created. Please try again.");
    } finally {
      setCelebrationBusy(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <AppShell>
      <div className="chats-page">
        <header className="chats-header">
          <div>
            <span className="eyebrow">WhatsApp atelier</span>
            <h1>Every hello, <em>held together.</em></h1>
            <p>New customer messages arrive here automatically, ready to become thoughtful celebrations.</p>
          </div>
          <div className={`chat-live-card ${connected ? "is-live" : "is-offline"}`}>
            <span className="chat-live-pulse" aria-hidden="true" />
            <span>
              <small>WhatsApp line</small>
              <strong>{initialLoading ? "Checking connection…" : connected ? "Live & listening" : data?.connection.status || "Not connected"}</strong>
              {data?.connection.phone && <em>{data.connection.phone}</em>}
            </span>
            {refreshing && <RefreshCw className="chat-refresh-icon" size={14} aria-label="Refreshing chats" />}
          </div>
        </header>

        {error && (
          <div className="chats-error" role="alert">
            <AlertCircle size={19} />
            <span><strong>We lost the thread for a moment.</strong>{error}</span>
            <button type="button" onClick={() => void loadChats(false)}>Try again</button>
          </div>
        )}

        <section className={`chat-workspace ${mobileThreadOpen ? "mobile-thread-open" : ""} ${reviewOpen ? "ai-review-open" : ""}`} aria-label="WhatsApp conversations">
          <i className="conversation-ribbon" aria-hidden="true" />
          <aside className="conversation-pane" aria-label="Conversation list">
            <header className="conversation-pane-header">
              <span><small>Incoming ribbon</small><strong>Conversations</strong></span>
              <b>{data?.conversations.length ?? 0}</b>
            </header>

            {initialLoading ? (
              <div className="chat-list-loading" aria-live="polite" aria-label="Loading conversations">
                {[0, 1, 2].map((item) => <span key={item}><i /><b /><em /></span>)}
              </div>
            ) : data?.conversations.length ? (
              <div className="conversation-list">
                {data.conversations.map((conversation) => {
                  const active = conversation.id === selectedId;
                  return (
                    <button
                      type="button"
                      className={`conversation-row ${active ? "active" : ""}`}
                      key={conversation.id}
                      onClick={() => chooseConversation(conversation.id)}
                      aria-pressed={active}
                    >
                      <span className="conversation-avatar">{initials(conversation)}</span>
                      <span className="conversation-preview">
                        <span className="conversation-name-line">
                          <strong>{personName(conversation)}</strong>
                          <time dateTime={conversation.lastMessageAt ?? undefined}>{listTime(conversation.lastMessageAt)}</time>
                        </span>
                        <span className="conversation-last-message">{conversation.lastMessage?.trim() || "A new conversation has started"}</span>
                        <span className="conversation-meta">
                          <i>{conversation.contactKind?.replaceAll("_", " ") || "customer"}</i>
                          <b>{conversation.messageCount} {conversation.messageCount === 1 ? "message" : "messages"}</b>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="chat-empty-list">
                <span className="empty-ribbon-mark"><MessageCircle size={27} /></span>
                <small>Your ribbon is ready</small>
                <h2>The next hello starts here.</h2>
                <p>When someone messages your connected WhatsApp number, their conversation will appear automatically.</p>
                {!connected && <Link href="/settings/connections"><Settings2 size={15} /> Check connection</Link>}
              </div>
            )}
          </aside>

          <article className="thread-pane" aria-label={selected ? `Chat with ${personName(selected)}` : "Selected conversation"}>
            {selected ? (
              <>
                <header className="thread-header">
                  <button className="back-to-chats" type="button" onClick={() => setMobileThreadOpen(false)}>
                    <ArrowLeft size={18} /> <span>Back to chats</span>
                  </button>
                  <span className="thread-avatar">{initials(selected)}</span>
                  <span className="thread-person">
                    <strong>{personName(selected)}</strong>
                    {selected.phone && selected.displayName && <small>{selected.phone}</small>}
                  </span>
                  <button
                    className={`extract-order-button ${orderDraft && orderDraft.status !== "discarded" ? "has-draft" : ""}`}
                    type="button"
                    onClick={() => orderDraft && orderDraft.status !== "discarded" ? setReviewOpen(true) : void extractOrder()}
                    disabled={extractionBusy || (!hasExtractableText && !(orderDraft && orderDraft.status !== "discarded"))}
                    aria-label={!hasExtractableText ? "No text messages available to extract" : orderDraft && orderDraft.status !== "discarded" ? "Review extracted order details" : "Extract order details from this conversation"}
                  >
                    {extractionBusy ? <LoaderCircle className="spin" size={16} /> : orderDraft && orderDraft.status !== "discarded" ? <FileText size={16} /> : <WandSparkles size={16} />}
                    <span>{extractionBusy ? "Reading chat…" : orderDraft && orderDraft.status !== "discarded" ? "Review details" : hasExtractableText ? "Extract order details" : "No text to extract"}</span>
                  </button>
                  <span className={`thread-state ${connected ? "live" : "offline"}`}><i />{connected ? "Live" : "Offline"}</span>
                </header>

                {(extraction.status !== "idle" || orderDraft) && (
                  <div className={`ai-thread-ribbon ${extraction.status === "failed" ? "is-error" : orderDraft?.status === "confirmed" ? "is-confirmed" : ""}`}>
                    {extractionBusy ? <LoaderCircle className="spin" size={15} /> : orderDraft?.status === "confirmed" ? <BadgeCheck size={16} /> : extraction.status === "failed" ? <AlertCircle size={16} /> : <Sparkles size={15} />}
                    <span>
                      <strong>{extractionBusy ? "AI is gathering the order clues" : orderDraft?.status === "confirmed" ? "Extracted details confirmed" : extraction.status === "failed" ? "Analysis needs another try" : orderDraft?.status === "discarded" ? "Previous draft discarded" : "Order details are ready to review"}</strong>
                      <small>{extractionBusy ? "You can keep reading or replying while it works." : orderDraft?.status === "confirmed" ? orderDraft.invoiceId != null ? "The celebration journey is ready to open." : "Ready to become a real celebration journey." : extraction.status === "failed" ? (extraction.error || "The conversation could not be analyzed.") : orderDraft?.status === "discarded" ? "Run a fresh extraction whenever you are ready." : "Check missing facts before you confirm."}</small>
                    </span>
                    <button type="button" onClick={() => extraction.status === "failed" || orderDraft?.status === "discarded" ? void extractOrder() : setReviewOpen(true)} disabled={extractionBusy}>
                      {extraction.status === "failed" || orderDraft?.status === "discarded" ? "Try again" : "Open review"}
                    </button>
                  </div>
                )}

                <div className="message-stream" ref={scrollRef} aria-live="polite">
                  {threadLoading ? (
                    <div className="thread-loading"><LoaderCircle className="spin" size={25} /><span>Gathering the conversation…</span></div>
                  ) : orderedMessages.length ? (
                    orderedMessages.map((message, index) => {
                      const previous = orderedMessages[index - 1];
                      const showDay = !previous || dayLabel(previous.sentAt) !== dayLabel(message.sentAt);
                      const media = message.mediaMimeType ? mediaLabel(message.mediaMimeType) : null;
                      const MediaIcon = media?.icon;
                      return (
                        <div className="message-item" key={message.id}>
                          {showDay && <div className="message-day"><span>{dayLabel(message.sentAt)}</span></div>}
                          <div className={`message-line ${message.direction}`}>
                            <div className="message-bubble">
                              {media && MediaIcon && <span className="message-media"><MediaIcon size={18} /><b>{media.label}</b><small>{message.mediaMimeType}</small></span>}
                              {message.body?.trim() && <p>{message.body}</p>}
                              {!message.body?.trim() && !media && <p className="message-unsupported">Unsupported WhatsApp message</p>}
                              <time dateTime={message.sentAt}>{messageTime(message.sentAt)}{message.direction === "outbound" && <Check size={12} />}</time>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="thread-empty">
                      <Sparkles size={24} />
                      <h2>A quiet beginning.</h2>
                      <p>There are no saved messages in this conversation yet.</p>
                    </div>
                  )}
                </div>

                <form className="reply-composer" onSubmit={(event) => void sendMessage(event)}>
                  <label htmlFor="chat-reply">Reply to {personName(selected)}</label>
                  <div>
                    <textarea
                      ref={textareaRef}
                      id="chat-reply"
                      rows={1}
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={connected ? "Write a warm reply…" : "Reconnect WhatsApp to reply"}
                      disabled={!connected || sending}
                      maxLength={4_000}
                    />
                    <button type="submit" disabled={!connected || sending || !replyDraft.trim()} aria-label="Send reply">
                      {sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                      <span>{sending ? "Sending" : "Send"}</span>
                    </button>
                  </div>
                  <footer>
                    <span>Enter to send · Shift + Enter for a new line</span>
                    {sendNote && <strong role="status">{sendNote}</strong>}
                  </footer>
                </form>
              </>
            ) : initialLoading ? (
              <div className="thread-loading"><LoaderCircle className="spin" size={25} /><span>Opening the message desk…</span></div>
            ) : (
              <div className="thread-no-selection">
                <span><Inbox size={28} /></span>
                <small>Conversation atelier</small>
                <h2>{data?.conversations.length ? "Choose a hello to begin." : "Your message desk is ready."}</h2>
                <p>{data?.conversations.length ? "Select a conversation from the ribbon to read and reply." : "Fresh WhatsApp conversations will be tied together here as they arrive."}</p>
              </div>
            )}
          </article>

          {reviewOpen && selected && (
            <aside className="ai-review-panel" aria-label="AI order details review" aria-live="polite">
              <header className="ai-review-header">
                <span className="ai-review-tab"><WandSparkles size={17} /></span>
                <div>
                  <small>Order card · drawn from this chat</small>
                  <h2>{orderDraft?.status === "confirmed" ? orderDraft.invoiceId != null ? "Journey, tied & ready." : "Details, tied & kept." : "Review what AI found."}</h2>
                </div>
                <button type="button" onClick={() => setReviewOpen(false)} aria-label="Close order details review"><X size={20} /></button>
              </header>

              <div className="ai-review-scroll">
                {(aiError || extraction.status === "failed") && (
                  <div className="ai-review-error" role="alert">
                    <AlertCircle size={18} />
                    <span><strong>We could not finish the order card.</strong>{aiError || extraction.error || "Please try the extraction again."}</span>
                    <button type="button" onClick={() => void extractOrder()} disabled={extractionBusy}>Try again</button>
                  </div>
                )}

                {extractionBusy && !orderDraft ? (
                  <div className="ai-extraction-progress">
                    <span className="ai-progress-mark"><LoaderCircle className="spin" size={26} /></span>
                    <small>Manual extraction in progress</small>
                    <h3>Turning the chat into a tidy order card…</h3>
                    <ol>
                      <li className="done"><Check size={14} /><span><strong>Gathering the conversation</strong><small>Bringing the full saved chat together</small></span></li>
                      <li className={extraction.status === "processing" ? "active" : ""}><Sparkles size={14} /><span><strong>Reading the context</strong><small>Connecting names, dates, gifts and delivery clues</small></span></li>
                      <li><FileText size={14} /><span><strong>Preparing your draft</strong><small>Marking anything that still needs clarification</small></span></li>
                    </ol>
                    <p>You can close this card. Analysis will continue and the review will be waiting here.</p>
                  </div>
                ) : orderDraft ? (
                  <>
                    {orderDraft.status === "confirmed" && (
                      <div className="ai-confirmed-note">
                        <BadgeCheck size={30} />
                        <span><strong>{orderDraft.invoiceId != null ? "Celebration created" : "Confirmed by you"}</strong><small>{orderDraft.invoiceId != null ? "This AI evidence is linked to its operational celebration journey." : "These extracted details are preserved. No order or invoice has been created yet."}</small></span>
                      </div>
                    )}

                    {orderDraft.status === "discarded" ? (
                      <div className="ai-discarded-state">
                        <Trash2 size={24} />
                        <small>Draft set aside</small>
                        <h3>Ready for a fresh look.</h3>
                        <p>The previous extraction was discarded. Analyze the saved conversation again whenever it has the details you need.</p>
                        <button type="button" onClick={() => void extractOrder()} disabled={extractionBusy}><WandSparkles size={16} /> Extract fresh details</button>
                      </div>
                    ) : (
                      <>
                        <div className="ai-review-intro">
                          <p>Read each fact before confirming. <strong>“Not found yet”</strong> means the customer may still need to tell you.</p>
                          <span>{orderDraft.sourceMessageCount} source {orderDraft.sourceMessageCount === 1 ? "message" : "messages"}</span>
                        </div>

                        {editedSnapshot && <DraftEditor snapshot={editedSnapshot} onChange={changeDraft} disabled={orderDraft.invoiceId != null || draftSaveState === "saving"} />}

                        {orderDraft.invoiceId == null && (
                          <div className={`draft-save-bar is-${draftSaveState}`} role="status" aria-live="polite">
                            <span>
                              {draftSaveState === "saving" ? <LoaderCircle className="spin" size={17} /> : draftSaveState === "saved" ? <BadgeCheck size={17} /> : draftSaveState === "stale" || draftSaveState === "error" ? <AlertCircle size={17} /> : <PencilLine size={17} />}
                              <span><strong>{draftSaveState === "dirty" ? "Corrections waiting to be tied in" : draftSaveState === "saved" ? "Order card saved" : draftSaveState === "stale" ? "A newer draft is available" : draftSaveState === "error" ? "Save needs attention" : "Edit any clue that needs a human correction"}</strong><small>{draftSaveNote || "Changes stay local until you save them."}</small></span>
                            </span>
                            {draftSaveState === "stale" ? <button type="button" onClick={() => void loadChats(false)}><RefreshCw size={14} /> Load latest</button> : <button type="button" onClick={() => void saveOrderDraft()} disabled={draftSaveState !== "dirty"}><Save size={14} /> {draftSaveState === "saving" ? "Saving…" : "Save corrections"}</button>}
                          </div>
                        )}

                        <section className={`clarification-card ${orderDraft.missingFields.length ? "has-missing" : "is-complete"}`}>
                          <header><span>{orderDraft.missingFields.length ? <AlertCircle size={17} /> : <Check size={17} />}</span><div><small>Needs clarification</small><h3>{orderDraft.missingFields.length ? `${orderDraft.missingFields.length} ${orderDraft.missingFields.length === 1 ? "detail" : "details"} to ask about` : "No missing details detected"}</h3></div></header>
                          {orderDraft.missingFields.length ? <ul>{orderDraft.missingFields.map((field) => <li key={field}>{readableField(field)}</li>)}</ul> : <p>Still give every fact a quick human check before confirming.</p>}
                        </section>

                        <footer className="ai-source-note">
                          <CalendarDays size={15} />
                          <span><strong>Evidence note · {confidenceLabel(orderDraft.confidence)}</strong><small>Drawn from {orderDraft.sourceMessageCount} saved messages · Updated {listTime(orderDraft.updatedAt)}. Confidence varies by field; missing and uncertain details stay marked for your review.</small></span>
                        </footer>

                        {orderDraft.status === "confirmed" && (
                          <section className={`celebration-handoff ${orderDraft.invoiceId != null ? "is-created" : ""}`} aria-labelledby="celebration-handoff-title">
                            <header>
                              <small>{orderDraft.invoiceId != null ? "Final knot · journey created" : "Final knot · ready to hand off"}</small>
                              <h3 id="celebration-handoff-title">{orderDraft.invoiceId != null ? "Your celebration is in motion." : "Turn this evidence into a celebration."}</h3>
                              <p>{orderDraft.invoiceId != null ? "The trusted draft now has a home for every preparation, update and delivery step." : "One action creates the operational records and carries this chat evidence into the delivery journey."}</p>
                            </header>

                            <div className="handoff-stitch" aria-label="AI draft becomes a celebration journey">
                              <span><i><Sparkles size={13} /></i><b>AI draft</b></span>
                              <em aria-hidden="true"><ArrowRight size={15} /></em>
                              <span><i><MapPin size={13} /></i><b>Journey</b></span>
                            </div>

                            {orderDraft.invoiceId == null ? (
                              <>
                                <div className="handoff-manifest">
                                  <p><Check size={13} /><span><strong>People & order</strong><small>Customer, recipient, a real celebration order and requested item rows</small></span></p>
                                  <p><Check size={13} /><span><strong>Operational journey</strong><small>Delivery milestones plus preparation and media tasks</small></span></p>
                                  <p><Check size={13} /><span><strong>Traceable evidence</strong><small>Links back to this WhatsApp conversation and the AI source messages</small></span></p>
                                </div>

                                {orderDraft.missingFields.length > 0 && (
                                  <div className="handoff-missing-note">
                                    <AlertCircle size={17} />
                                    <p><strong>Missing details will not hold this up.</strong><span>{orderDraft.missingFields.length === 1 ? "The missing detail becomes" : `Each of the ${orderDraft.missingFields.length} missing details becomes`} an urgent journey task.</span></p>
                                  </div>
                                )}

                                <div className="handoff-payment-note">
                                  <CircleDollarSign size={17} />
                                  <p><strong>Receipt details stay unverified.</strong><span>Creating the celebration does not mark payment as received. Bank verification remains a separate step.</span></p>
                                </div>

                                {celebrationError && (
                                  <div className="handoff-error" role="alert">
                                    <AlertCircle size={16} />
                                    <p><strong>The knot did not hold.</strong><span>{celebrationError}</span></p>
                                  </div>
                                )}

                                <button className="create-celebration-button" type="button" onClick={() => void createCelebration()} disabled={celebrationBusy || Boolean(aiAction)} aria-describedby="celebration-create-note">
                                  {celebrationBusy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}
                                  <span>{celebrationBusy ? "Creating celebration…" : "Create celebration"}</span>
                                  {!celebrationBusy && <ArrowRight size={17} />}
                                </button>
                                <p className="handoff-action-note" id="celebration-create-note" role="status" aria-live="polite">{celebrationBusy ? "Tying records, tasks and evidence together. Please keep this panel open." : "Safe to retry — this action will never create the same celebration twice."}</p>
                              </>
                            ) : (
                              <div className="handoff-created-destination">
                                <BadgeCheck size={25} />
                                <span><strong>Everything is tied together.</strong><small>Order #{orderDraft.invoiceId} is ready for its next operational step.</small></span>
                                <Link href={`/celebrations/${orderDraft.invoiceId}`}>Open celebration <ArrowRight size={16} /></Link>
                              </div>
                            )}
                          </section>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div className="ai-ready-state">
                    <span><WandSparkles size={25} /></span>
                    <small>Full conversation analysis</small>
                    <h3>Pull the order details from this chat.</h3>
                    <p>AI will read the saved conversation, organize the useful facts, and mark what still needs clarification.</p>
                    <button type="button" onClick={() => void extractOrder()} disabled={extractionBusy}><WandSparkles size={16} /> Extract order details</button>
                  </div>
                )}
              </div>

              {orderDraft && orderDraft.status !== "discarded" && (
                <footer className="ai-review-actions">
                  <p><Sparkles size={13} /> New inbound messages can refresh a draft automatically. Manual extraction reads the full saved conversation.</p>
                  <div>
                    <button className="ai-reextract" type="button" onClick={() => void extractOrder()} disabled={extractionBusy || Boolean(aiAction) || celebrationBusy}><RotateCw className={extractionBusy ? "spin" : ""} size={15} /> Re-extract</button>
                    {orderDraft.status !== "confirmed" && <button className="ai-confirm" type="button" onClick={() => void updateOrderDraft("confirm")} disabled={extractionBusy || Boolean(aiAction) || celebrationBusy || draftSaveState === "dirty" || draftSaveState === "saving"}>{aiAction === "confirm" ? <LoaderCircle className="spin" size={16} /> : <BadgeCheck size={16} />} {draftSaveState === "dirty" ? "Save before confirming" : "Confirm extracted details"}</button>}
                    {orderDraft.invoiceId == null && <button className="ai-discard" type="button" onClick={() => void updateOrderDraft("discard")} disabled={extractionBusy || Boolean(aiAction) || celebrationBusy}>{aiAction === "discard" ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />} Discard draft</button>}
                  </div>
                </footer>
              )}
            </aside>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function DraftEditor({ snapshot, onChange, disabled }: { snapshot: DraftSnapshot; onChange: (snapshot: DraftSnapshot) => void; disabled: boolean }) {
  const text = (value: string | null | undefined) => value ?? "";
  const setGroup = <K extends "sender" | "recipient" | "delivery" | "agreedPrice" | "receipt">(group: K, key: string, value: string | number | null) => {
    onChange({ ...snapshot, [group]: { ...(snapshot[group] ?? {}), [key]: value } });
  };
  const items = snapshot.items ?? [];
  return (
    <fieldset className="evidence-thread editable-evidence" disabled={disabled}>
      <legend className="sr-only">Editable extracted celebration details</legend>
      <section className="evidence-section">
        <span className="evidence-icon"><Users size={16} /></span>
        <header><small>01 · People</small><h3>Who is sending the celebration?</h3></header>
        <div className="fact-grid form-fact-grid">
          <DraftField label="Sender" value={text(snapshot.sender?.name)} onChange={(value) => setGroup("sender", "name", value || null)} />
          <DraftField label="Sender phone" type="tel" value={text(snapshot.sender?.phone)} onChange={(value) => setGroup("sender", "phone", value || null)} />
          <DraftField label="Sender country" value={text(snapshot.sender?.country)} onChange={(value) => setGroup("sender", "country", value || null)} />
          <DraftField label="Recipient" value={text(snapshot.recipient?.name)} onChange={(value) => setGroup("recipient", "name", value || null)} />
          <DraftField label="Recipient phone" type="tel" value={text(snapshot.recipient?.phone)} onChange={(value) => setGroup("recipient", "phone", value || null)} />
        </div>
      </section>

      <section className="evidence-section">
        <span className="evidence-icon"><Package size={16} /></span>
        <header><small>02 · Celebration</small><h3>The reason & thoughtful pieces</h3></header>
        <DraftField wide label="Occasion" value={text(snapshot.occasion)} onChange={(value) => onChange({ ...snapshot, occasion: value || null })} />
        <div className="editable-item-list">
          {items.map((item, index) => (
            <div key={index} className="editable-item-row">
              <label><span>Category</span><select value={item.category || "other"} onChange={(event) => onChange({ ...snapshot, items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, category: event.target.value } : entry) })}><option value="cake">Cake</option><option value="flowers">Flowers</option><option value="gift">Gift</option><option value="other">Other</option></select></label>
              <label><span>Description</span><input value={item.description || ""} onChange={(event) => onChange({ ...snapshot, items: items.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry) })} placeholder="What should be prepared?" /></label>
              <button type="button" onClick={() => onChange({ ...snapshot, items: items.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove item ${index + 1}`}><Trash2 size={14} /></button>
            </div>
          ))}
          <button className="add-draft-item" type="button" onClick={() => onChange({ ...snapshot, items: [...items, { category: "other", description: "" }] })}><Plus size={14} /> Add another item</button>
        </div>
        <DraftField wide multiline label="Special request" value={text(snapshot.specialRequest)} onChange={(value) => onChange({ ...snapshot, specialRequest: value || null })} placeholder="Personal touches, card message, dietary notes…" />
        <label className="draft-select-field"><span>Fulfilment mode</span><select value={snapshot.fulfilmentMode || "self"} onChange={(event) => onChange({ ...snapshot, fulfilmentMode: event.target.value as "self" | "partner" | "hybrid" })}><option value="self">Self fulfilled</option><option value="partner">Partner fulfilled</option><option value="hybrid">Hybrid</option></select></label>
      </section>

      <section className="evidence-section">
        <span className="evidence-icon"><MapPin size={16} /></span>
        <header><small>03 · Delivery</small><h3>Where & when it should arrive</h3></header>
        <div className="fact-grid form-fact-grid">
          <DraftField label="Date" type="date" value={text(snapshot.delivery?.date)} onChange={(value) => setGroup("delivery", "date", value || null)} />
          <DraftField label="Time" type="time" value={text(snapshot.delivery?.time)} onChange={(value) => setGroup("delivery", "time", value || null)} />
          <DraftField wide label="Address" value={text(snapshot.delivery?.address)} onChange={(value) => setGroup("delivery", "address", value || null)} />
          <DraftField label="District" value={text(snapshot.delivery?.district)} onChange={(value) => setGroup("delivery", "district", value || null)} />
        </div>
      </section>

      <section className="evidence-section money-section">
        <span className="evidence-icon"><CircleDollarSign size={16} /></span>
        <header><small>04 · Money</small><h3>Prices mentioned in the chat</h3></header>
        <div className="draft-money-grid">
          <div><small>Agreed price</small><DraftField label="Amount" type="number" min="0" value={snapshot.agreedPrice?.amount?.toString() ?? ""} onChange={(value) => setGroup("agreedPrice", "amount", value === "" ? null : Number(value))} /><DraftField label="Currency" value={text(snapshot.agreedPrice?.currency) || "LKR"} onChange={(value) => setGroup("agreedPrice", "currency", value.toUpperCase() || null)} /></div>
          <div className="draft-receipt-card"><small>Receipt metadata · not bank verified</small><DraftField label="Amount" type="number" min="0" value={snapshot.receipt?.amount?.toString() ?? ""} onChange={(value) => setGroup("receipt", "amount", value === "" ? null : Number(value))} /><DraftField label="Currency" value={text(snapshot.receipt?.currency) || "LKR"} onChange={(value) => setGroup("receipt", "currency", value.toUpperCase() || null)} /><DraftField label="Date" type="date" value={text(snapshot.receipt?.date)} onChange={(value) => setGroup("receipt", "date", value || null)} /><DraftField label="Reference" value={text(snapshot.receipt?.reference)} onChange={(value) => setGroup("receipt", "reference", value || null)} /></div>
        </div>
      </section>
    </fieldset>
  );
}

function DraftField({ label, value, onChange, type = "text", wide = false, multiline = false, placeholder, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean; multiline?: boolean; placeholder?: string; min?: string }) {
  return <label className={`draft-field ${wide ? "fact-span" : ""}`}><span>{label}</span>{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <input type={type} min={min} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || "Not found yet"} />}</label>;
}
