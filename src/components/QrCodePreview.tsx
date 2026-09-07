"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

/** Renders a QR code for the given value onto a canvas, client-side only. */
export function QrCodePreview({ value, className }: { value: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!value) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    QRCode.toCanvas(canvas, value, { margin: 0, width: 256 }).catch(() => {});
  }, [value]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
