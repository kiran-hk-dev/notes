"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileWarning, PackageOpen } from "lucide-react";
import { decodeSharePayload, importBundle } from "@/lib/export/bundle";
import { useLibrary } from "@/lib/state/libraryStore";
import { Button } from "@/components/ui/Button";

export default function ImportPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) {
        setDetail("This link does not contain a notebook payload.");
        setStatus("error");
        return;
      }
      const bundle = await decodeSharePayload(hash);
      if (cancelled) return;
      if (!bundle) {
        setDetail("The link could not be decoded. It may be truncated or corrupted.");
        setStatus("error");
        return;
      }
      try {
        const notebook = await importBundle(bundle);
        if (cancelled) return;
        await useLibrary.getState().refresh();
        router.replace(`/notebook/${notebook.id}`);
      } catch {
        setDetail("The notebook could not be saved in this browser.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {status === "loading" ? (
        <>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
            <PackageOpen className="size-6" />
          </span>
          <h1 className="text-lg font-semibold text-ink">Importing shared notebook…</h1>
          <span className="size-7 animate-spin rounded-full border-2 border-line border-t-accent" aria-label="Importing" />
        </>
      ) : (
        <>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <FileWarning className="size-6" />
          </span>
          <h1 className="text-lg font-semibold text-ink">Could not import this link</h1>
          <p className="max-w-sm text-sm text-ink-soft">{detail}</p>
          <Button variant="primary" onClick={() => router.push("/")}>
            Back to library
          </Button>
        </>
      )}
    </div>
  );
}
