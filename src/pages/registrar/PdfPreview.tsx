import React, { useEffect, useRef, useState } from "react";
export default function PdfPreview({
  url,
  onReady,
  title = "Pregled dokumenta prije izdavanja",
}: {
  url: string;
  onReady?: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    ready = useRef(onReady);
  ready.current = onReady;
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false,
      document: any;
    setLoading(true);
    setError("");
    const host = ref.current;
    host?.replaceChildren();
    (async () => {
      try {
        const { getDocumentProxy } = await import("unpdf");
        const response = await fetch(url);
        if (!response.ok) throw new Error("PDF nije dostupan.");
        document = await getDocumentProxy(
          new Uint8Array(await response.arrayBuffer()),
        );
        for (let index = 1; index <= document.numPages; index++) {
          if (cancelled) return;
          const page = await document.getPage(index),
            viewport = page.getViewport({ scale: 1 });
          const width = Math.min(
              1000,
              Math.max(280, (host?.clientWidth || 700) - 24),
            ),
            scale =
              (width / viewport.width) *
              Math.min(2, window.devicePixelRatio || 1),
            renderViewport = page.getViewport({ scale });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.setAttribute(
            "aria-label",
            `Stranica ${index} od ${document.numPages}`,
          );
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Preglednik ne podržava prikaz PDF-a.");
          await page.render({
            canvasContext: context,
            viewport: renderViewport,
          }).promise;
          if (cancelled) return;
          const label = window.document.createElement("p");
          label.textContent = `Stranica ${index} od ${document.numPages}`;
          label.className = "text-xs text-slate-500 my-2";
          host?.append(label, canvas);
        }
        if (!cancelled) {
          setLoading(false);
          ready.current?.();
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoading(false);
          setError(e.message || "Pregled PDF-a nije uspio.");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (typeof document?.destroy === "function") document.destroy();
      else if (typeof document?.cleanup === "function") document.cleanup();
    };
  }, [url]);
  return (
    <div
      className="max-h-[65vh] overflow-auto rounded border bg-slate-100 p-3"
      title={title}
    >
      {loading && <p role="status">Učitavanje svih stranica PDF-a…</p>}
      {error && (
        <p role="alert">
          {error} Dokument možete otvoriti poveznicom „Otvori PDF”.
        </p>
      )}
      <div ref={ref} className="mx-auto max-w-[1000px]" />
    </div>
  );
}
