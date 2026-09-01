"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/prints", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Fehler beim Verarbeiten der Datei.");
        return;
      }
      router.push(`/prints/${body.print.id}`);
      router.refresh();
    } catch {
      setError("Upload fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
      }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragging
          ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30"
          : "border-slate-300 bg-white hover:border-orange-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-orange-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".3mf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <p className="text-4xl">📦</p>
      <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">
        {isUploading ? "Wird verarbeitet…" : "gcode.3mf Datei hier ablegen oder klicken"}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Exportiert aus Bambu Studio oder OrcaSlicer (mit Sliceinformationen)
      </p>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
