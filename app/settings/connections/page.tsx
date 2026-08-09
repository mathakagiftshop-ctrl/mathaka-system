"use client";

import { AppShell } from "@/components/app-shell";
import { Toast } from "@/components/ui";
import {
  ArrowRight,
  Bot,
  CircleAlert,
  Cloud,
  ChevronUp,
  Database,
  Gift,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  PlugZap,
  QrCode,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";

type IntegrationStatus = {
  database: {
    connected: boolean;
    orderCount: number | null;
    projectRef: string | null;
    checkedAt: string;
  };
  whatsapp: {
    status: "awaiting_worker" | "disconnected" | "connected" | "pairing" | "reconnecting" | "unavailable";
    phone: string | null;
    lastHeartbeat: string | null;
  };
  geminiConfigured: boolean;
  workerConfigured: boolean;
};

function timeLabel(value: string | null) {
  if (!value) return "No heartbeat yet";
  return new Intl.DateTimeFormat("en-LK", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(value));
}

function StatusTag({ tone, children }: { tone: "good" | "waiting" | "attention"; children: React.ReactNode }) {
  return <span className={`connection-status ${tone}`}><i />{children}</span>;
}

export default function ConnectionsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testingExtraction, setTestingExtraction] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [qrNonce, setQrNonce] = useState(0);

  const loadStatus = useCallback(async (manual = false) => {
    if (manual) setTesting(true);
    else setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/integrations/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Status request failed");
      const nextStatus = await response.json() as IntegrationStatus;
      setStatus(nextStatus);
      if (manual) setToast(nextStatus.database.connected ? "Supabase connection is healthy" : "Supabase needs attention");
    } catch {
      setError(true);
      if (manual) setToast("Connection check could not be completed");
    } finally {
      setLoading(false);
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStatus(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.workerConfigured || status.whatsapp.status === "connected") return;
    const timer = window.setInterval(() => {
      setQrNonce(Date.now());
      void loadStatus();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, status?.workerConfigured, status?.whatsapp.status]);

  const summary = useMemo(() => {
    if (!status) return { connected: 0, setup: 0, attention: error ? 1 : 0 };
    const connected = Number(status.database.connected) + Number(status.whatsapp.status === "connected") + Number(status.geminiConfigured);
    const setup = Number(status.whatsapp.status !== "connected") + Number(!status.geminiConfigured);
    const attention = Number(!status.database.connected);
    return { connected, setup, attention };
  }, [status, error]);

  const disconnectWhatsApp = async () => {
    if (!window.confirm("Disconnect this WhatsApp device and create a new pairing session?")) return;
    setDisconnecting(true);
    try {
      const response = await fetch("/api/integrations/whatsapp/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Disconnect failed");
      setToast("WhatsApp disconnect queued — a fresh QR will appear shortly");
      window.setTimeout(() => void loadStatus(), 6_000);
    } catch {
      setToast("WhatsApp could not be disconnected");
    } finally {
      setDisconnecting(false);
    }
  };

  const testExtraction = async () => {
    setTestingExtraction(true);
    try {
      const response = await fetch("/api/integrations/test-extraction", { method: "POST" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Extraction test could not be queued");
      setToast("Extraction test queued — open Chats to review the result");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Extraction test could not be queued");
    } finally {
      setTestingExtraction(false);
    }
  };

  const whatsappLabel = status?.whatsapp.status === "connected"
    ? "Connected"
    : status?.whatsapp.status === "pairing"
      ? "Ready to pair"
      : status?.whatsapp.status === "reconnecting"
        ? "Reconnecting"
        : status?.workerConfigured
          ? "Worker online"
          : "Awaiting worker";

  return (
    <AppShell>
      <div className="page connections-page">
        <header className="page-header connections-header">
          <div>
            <span className="eyebrow">Backstage ribbon desk</span>
            <h1>Connections that keep<br/>the magic moving.</h1>
            <p>See what is ready, what needs a hand, and how every WhatsApp message becomes part of a celebration journey.</p>
          </div>
          <div className="connection-seal" aria-hidden="true"><PlugZap/><span>Studio<br/>systems</span></div>
        </header>

        <section className="connection-summary" aria-label="Connection summary">
          <div className="summary-lead"><Sparkles size={19}/><span><strong>Studio pulse</strong><small>{loading ? "Checking every thread…" : "A clear view of your three connections"}</small></span></div>
          <div><strong>{loading ? "—" : summary.connected}</strong><span>Connected</span></div>
          <div><strong>{loading ? "—" : summary.setup}</strong><span>Needs setup</span></div>
          <div className={summary.attention ? "summary-attention" : ""}><strong>{loading ? "—" : summary.attention}</strong><span>Action required</span></div>
        </section>

        {error && !status && <section className="connection-error" role="alert"><CircleAlert/><div><strong>We couldn’t check the connections.</strong><span>The studio is still available. Try the status check again.</span></div><button className="secondary-button" onClick={() => void loadStatus()}>Try again</button></section>}

        <section className="connections-stack" aria-label="Integration connections">
          <article className="connection-panel supabase-panel">
            <div className="connection-number">01</div>
            <div className="connection-icon database-icon"><Database/></div>
            <div className="connection-copy">
              <span className="connection-kicker">The record keeper</span>
              <div className="connection-title-row"><h2>Supabase</h2>{loading ? <StatusTag tone="waiting">Checking</StatusTag> : <StatusTag tone={status?.database.connected ? "good" : "attention"}>{status?.database.connected ? "Connected" : "Connection failed"}</StatusTag>}</div>
              <p>Orders, tasks, payments and future WhatsApp events are kept together here. Legacy order data is read securely on the server.</p>
              <dl className="connection-facts">
                <div><dt>Project</dt><dd>{loading ? "Checking…" : status?.database.projectRef || "Not available"}</dd></div>
                <div><dt>Live orders</dt><dd>{loading ? "—" : status?.database.orderCount ?? "Unavailable"}</dd></div>
                <div><dt>Last checked</dt><dd>{status?.database.checkedAt ? timeLabel(status.database.checkedAt) : "Not checked"}</dd></div>
              </dl>
            </div>
            <div className="connection-action">
              <button className="secondary-button" disabled={testing} onClick={() => void loadStatus(true)}>{testing ? <LoaderCircle className="spin" size={16}/> : <RefreshCw size={16}/>}Test connection</button>
              <small>Server-side check. Credentials stay private.</small>
            </div>
          </article>

          <article className="connection-panel whatsapp-panel">
            <div className="connection-number">02</div>
            <div className="connection-icon whatsapp-icon"><MessageCircle/></div>
            <div className="connection-copy">
              <span className="connection-kicker">The conversation thread</span>
              <div className="connection-title-row"><h2>WhatsApp Business</h2><StatusTag tone={status?.whatsapp.status === "connected" ? "good" : "waiting"}>{whatsappLabel}</StatusTag></div>
              <p>Baileys will live in an always-on Google Cloud worker—not inside Vercel—so customer and partner conversations can stay reliably connected.</p>
              {status?.whatsapp.status === "connected" && <dl className="connection-facts compact"><div><dt>Number</dt><dd>{status.whatsapp.phone || "Number hidden"}</dd></div><div><dt>Last heartbeat</dt><dd>{timeLabel(status.whatsapp.lastHeartbeat)}</dd></div></dl>}
              {status?.workerConfigured && status.whatsapp.status !== "connected" && <div className="worker-note worker-ready"><Cloud size={17}/><span><strong>The isolated Google Cloud worker is online.</strong> It is waiting for this business phone to be paired; the old WhatsApp worker remains separate.</span></div>}
              {!status?.workerConfigured && <div className="worker-note"><Cloud size={17}/><span><strong>Google Cloud worker is not deployed yet.</strong> The connection controls will become live after the worker secret is added.</span></div>}
            </div>
            <div className="connection-action">
              {status?.whatsapp.status === "connected" && <button className="secondary-button disconnect-button" disabled={disconnecting} onClick={() => void disconnectWhatsApp()}>{disconnecting ? <LoaderCircle className="spin" size={16}/> : <LockKeyhole size={16}/>}Disconnect WhatsApp</button>}
              <button className="primary-button setup-toggle" aria-expanded={setupOpen} aria-controls="whatsapp-setup" onClick={() => setSetupOpen((value) => !value)}><Smartphone size={17}/>{setupOpen ? "Hide setup steps" : status?.workerConfigured ? "Connect WhatsApp" : "View setup steps"}{setupOpen && <ChevronUp size={16} aria-hidden="true"/>}</button>
              <small>{status?.workerConfigured ? `Worker heartbeat: ${timeLabel(status.whatsapp.lastHeartbeat)}` : "No QR code will be generated until the worker is ready."}</small>
            </div>
            {setupOpen && <div id="whatsapp-setup" className="whatsapp-setup">
              <div className="setup-copy"><span className="eyebrow">Connection path</span><h3>Three steps to the first message</h3><ol><li><span>1</span><div><strong>Worker deployed</strong><small>The new isolated Baileys worker is running on Google Cloud.</small></div></li><li><span>2</span><div><strong>Vertex identity ready</strong><small>Gemini uses the worker service account, so no API key reaches the browser.</small></div></li><li><span>3</span><div><strong>Pair the business phone</strong><small>Scan the temporary code from WhatsApp → Linked devices.</small></div></li></ol></div>
              <div className={`pairing-reserve ${status?.whatsapp.status === "pairing" ? "pairing-live" : ""}`} aria-label="Pairing code status">
                {status?.whatsapp.status === "pairing" ? <Image key={qrNonce} src={`/api/integrations/whatsapp/pairing?v=${qrNonce}`} alt="WhatsApp linked-device pairing QR code" width={184} height={184} unoptimized priority/> : <QrCode size={43}/>}
                <strong>{status?.whatsapp.status === "pairing" ? "Scan with WhatsApp" : "Secure pairing"}</strong>
                <span>{status?.whatsapp.status === "pairing" ? "On the business phone, open Settings → Linked devices → Link a device. This code refreshes automatically." : "Pairing controls appear only while the isolated worker is online."}</span>
              </div>
            </div>}
          </article>

          <article className="connection-panel gemini-panel">
            <div className="connection-number">03</div>
            <div className="connection-icon gemini-icon"><Bot/></div>
            <div className="connection-copy">
              <span className="connection-kicker">The careful reader</span>
              <div className="connection-title-row"><h2>Gemini 3.6 Flash</h2><StatusTag tone={status?.geminiConfigured ? "good" : "waiting"}>{status?.geminiConfigured ? "Configured" : "Not configured"}</StatusTag></div>
              <p>Gemini will extract dates, addresses, gifts, cake details and receipt fields from conversations. The Cloud worker authenticates to Vertex AI with its own service account.</p>
            </div>
            <div className="connection-action">
              <button className="secondary-button" disabled={!status?.geminiConfigured || testingExtraction} title={!status?.geminiConfigured ? "Deploy the Vertex-enabled worker first" : undefined} onClick={() => void testExtraction()}>{testingExtraction ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>}Test extraction</button>
              <small>{status?.geminiConfigured ? "Vertex AI identity is ready for a safe sample test." : "Deploy the Vertex-enabled worker to enable testing."}</small>
            </div>
          </article>
        </section>

        <section className="message-travel">
          <header><span className="eyebrow">How messages travel</span><h2>One ribbon, from hello to order.</h2><p>Each knot has one job, so a restart or missed message never loses the celebration.</p></header>
          <div className="message-ribbon" role="list" aria-label="Message processing flow">
            <div role="listitem"><span className="ribbon-knot"><MessageCircle/></span><strong>WhatsApp</strong><small>Customer or partner</small></div><ArrowRight aria-hidden="true"/>
            <div role="listitem"><span className="ribbon-knot"><Server/></span><strong>Google Cloud</strong><small>Baileys worker</small></div><ArrowRight aria-hidden="true"/>
            <div role="listitem"><span className="ribbon-knot"><Bot/></span><strong>Gemini</strong><small>Extracts details</small></div><ArrowRight aria-hidden="true"/>
            <div role="listitem"><span className="ribbon-knot"><Database/></span><strong>Supabase</strong><small>Stores the truth</small></div><ArrowRight aria-hidden="true"/>
            <div role="listitem"><span className="ribbon-knot"><Gift/></span><strong>Studio</strong><small>Order journey</small></div>
          </div>
        </section>

        <aside className="security-note">
          <div className="security-mark"><ShieldCheck/></div><div><span className="eyebrow">Kept under wraps</span><h2>Private by design.</h2></div>
          <p><LockKeyhole size={16}/>WhatsApp session keys are encrypted and never exposed to the browser.</p>
          <p><KeyRound size={16}/>Receipt recognition reads submitted details; it does not verify that money reached the bank.</p>
        </aside>
        {toast && <Toast message={toast} onClose={() => setToast("")}/>}
      </div>
    </AppShell>
  );
}
