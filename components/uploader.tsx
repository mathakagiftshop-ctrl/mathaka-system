"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

type Start = (contentType: string, size: number) => Promise<{ key: string; url: string }>;
type Finish = (key: string, contentType: string, caption: string) => Promise<void>;

/** Uploads photos/videos straight to storage with a signed URL, then records them. */
export function MediaUploader({ start, finish, label = "Upload photos or video" }: { start: Start; finish: Finish; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList) {
    setBusy(true);
    let done = 0;
    try {
      for (const file of Array.from(files)) {
        setStatus({ tone: "info", text: `Uploading ${done + 1} of ${files.length}…` });
        const type = file.type || "image/jpeg";
        const target = await start(type, file.size);
        const response = await fetch(target.url, { method: "PUT", body: file, headers: { "Content-Type": type } });
        if (!response.ok) throw new Error(`Upload failed (${response.status}). Check the storage CORS settings.`);
        await finish(target.key, type, "");
        done += 1;
      }
      setStatus({ tone: "success", text: `${done} file${done === 1 ? "" : "s"} uploaded.` });
      router.refresh();
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="btn" aria-disabled={busy}>
        <Upload size={16} />{busy ? "Uploading…" : label}
        <input ref={input} type="file" accept="image/*,video/*" multiple hidden disabled={busy} onChange={(event) => event.target.files?.length && upload(event.target.files)} />
      </label>
      {status && <p className={`notice ${status.tone}`}>{status.text}</p>}
    </div>
  );
}
