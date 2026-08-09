import { NextResponse } from "next/server";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";
import { getOwner } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

type WhatsAppRow = {
  status: string;
  phone_number: string | null;
  last_heartbeat_at: Date | string | null;
};

function safeProjectReference() {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!publicUrl) return null;
  try {
    const hostname = new URL(publicUrl).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : hostname;
  } catch {
    return null;
  }
}

function maskPhone(phone: string | null) {
  if (!phone) return null;
  const clean = phone.replace(/\s+/g, "");
  if (clean.length < 7) return "••••";
  return `${clean.slice(0, 3)} ••• ••${clean.slice(-2)}`;
}

export async function GET() {
  if (!(await getOwner())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const checkedAt = new Date().toISOString();
  const projectRef = safeProjectReference();
  const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY);

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      database: { connected: false, orderCount: null, projectRef, checkedAt },
      whatsapp: { status: "awaiting_worker", phone: null, lastHeartbeat: null },
      geminiConfigured: apiKeyConfigured,
      workerConfigured: false,
      storageConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }

  try {
    const sql = getDatabase();
    const countRows = await sql<{ count: string | number }[]>`select count(*) as count from public.invoices`;
    let connection: WhatsAppRow | undefined;

    try {
      const connectionRows = await sql<WhatsAppRow[]>`
        select status, phone_number, last_heartbeat_at
        from public.whatsapp_connections
        order by updated_at desc
        limit 1
      `;
      connection = connectionRows[0];
    } catch {
      // The core database can be healthy while the integration migration is pending.
    }

    const heartbeatAt = connection?.last_heartbeat_at
      ? new Date(connection.last_heartbeat_at)
      : null;
    const workerConfigured = Boolean(
      heartbeatAt && Date.now() - heartbeatAt.getTime() < 2 * 60_000,
    );
    // The Cloud worker uses its dedicated Vertex AI service account. A web-app
    // API key is therefore optional and should not be copied into the browser.
    const geminiConfigured = apiKeyConfigured || workerConfigured;
    const rawStatus = connection?.status;
    const whatsappStatus = !workerConfigured
      ? "awaiting_worker"
      : rawStatus === "connected"
        ? "connected"
        : rawStatus === "pairing" || rawStatus === "reconnecting"
          ? rawStatus
          : "disconnected";

    return NextResponse.json({
      database: {
        connected: true,
        orderCount: Number(countRows[0]?.count ?? 0),
        projectRef,
        checkedAt,
      },
      whatsapp: {
        status: whatsappStatus,
        phone: maskPhone(connection?.phone_number ?? null),
        lastHeartbeat: heartbeatAt?.toISOString() ?? null,
      },
      geminiConfigured,
      workerConfigured,
      storageConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  } catch {
    return NextResponse.json({
      database: { connected: false, orderCount: null, projectRef, checkedAt },
      whatsapp: { status: "unavailable", phone: null, lastHeartbeat: null },
      geminiConfigured: apiKeyConfigured,
      workerConfigured: false,
      storageConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }
}
