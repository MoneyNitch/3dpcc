"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useLocale } from "@/lib/locale";

export function UploadForm() {
  const router = useRouter();
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displayName, setDisplayName] = useState("");

  async function uploadFile(file: File, name: string) {
    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (name.trim()) formData.append("displayName", name.trim());
      const res = await fetch("/api/prints", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? t("upload.genericError"));
        return;
      }
      router.push(`/prints/${body.print.id}`);
      router.refresh();
    } catch {
      setError(t("upload.genericError"));
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
        if (file) {
          setSelectedFile(file);
          setDisplayName(file.name.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, ""));
        }
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
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setSelectedFile(file);
            setDisplayName(file.name.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, ""));
          }
        }}
      />
      <p className="text-4xl">📦</p>
      <p className="mt-2 font-medium text-slate-700 dark:text-slate-200">
        {isUploading ? t("upload.processing") : t("upload.dropText")}
      </p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("upload.hint")}
      </p>
      {selectedFile && !isUploading && (
        <div className="mx-auto mt-5 max-w-md text-left" onClick={(e) => e.stopPropagation()}>
          <label htmlFor="upload-display-name" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("upload.customName")}
          </label>
          <input
            id="upload-display-name"
            value={displayName}
            maxLength={200}
            placeholder={t("upload.customNamePlaceholder")}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:border-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => void uploadFile(selectedFile, displayName)}
            className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2 font-medium text-white hover:bg-orange-600"
          >
            {t("upload.submit")}
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
