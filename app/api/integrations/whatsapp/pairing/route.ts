import QRCode from "qrcode";
import { getOwner } from "@/lib/server/auth";
import { getDatabase, isDatabaseConfigured } from "@/lib/server/database";

export const dynamic = "force-dynamic";

type PairingRow = { value: string | null };

export async function GET() {
  if (!(await getOwner())) return new Response("Unauthorized", { status: 401 });
  if (!isDatabaseConfigured()) return new Response("Pairing unavailable", { status: 503 });

  const sql = getDatabase();
  const rows = await sql<PairingRow[]>`
    select pairing_payload->>'value' as value
    from public.whatsapp_connections
    where worker_id = 'mathaka-celebration-wa-v1'
      and status = 'pairing'
      and pairing_payload->>'type' = 'qr'
      and pairing_expires_at > now()
    limit 1
  `;
  const value = rows[0]?.value;
  if (!value) return new Response("A fresh pairing code is not available yet", { status: 404 });

  const image = await QRCode.toBuffer(value, {
    type: "png",
    width: 360,
    margin: 2,
    color: { dark: "#301a2d", light: "#fffdf8" },
    errorCorrectionLevel: "M",
  });

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
