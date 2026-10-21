"use client";

import { useEffect, useRef, useState } from "react";
import type { ModelGeometry } from "@/lib/types";
import { useLocale } from "@/lib/locale";
import { createToolpathRenderer } from "@/lib/toolpathRenderer";

type PreviewMode = "2d" | "3d";
type ModelStatus = "idle" | "computing" | "buildError" | "ready" | "unavailable" | "error";
type Point3D = [number, number, number];

interface Face {
  points: Point3D[];
  color: string;
}

function colorWithLight(color: string, brightness: number): string {
  let hex = color.startsWith("#") ? color.slice(1) : "94a3b8";
  if (hex.length === 8) hex = hex.slice(2);
  if (hex.length === 3) hex = hex.split("").map((part) => part + part).join("");
  if (!/^[\da-f]{6}$/i.test(hex)) hex = "94a3b8";
  const channels = [0, 2, 4].map((offset) =>
    Math.round(parseInt(hex.slice(offset, offset + 2), 16) * brightness)
  );
  return `rgb(${channels.join(" ")})`;
}

export function ModelPreview({
  printId,
  thumbnail,
  alt,
  allow3d,
}: {
  printId: string;
  thumbnail: string | null;
  alt: string;
  allow3d: boolean;
}) {
  const { t } = useLocale();
  const [requestedMode, setMode] = useState<PreviewMode>(thumbnail ? "2d" : "3d");
  const mode = allow3d ? requestedMode : "2d";
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [geometry, setGeometry] = useState<ModelGeometry | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef({ pitch: -0.48, yaw: 0.62, zoom: 1 });

  useEffect(() => {
    if (mode !== "3d" || geometry) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    function poll() {
      void fetch(`/api/prints/${encodeURIComponent(printId)}/model`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 202) {
          setStatus("computing");
          timer = setTimeout(poll, 3000);
          return null;
        }
        if (response.status === 409) {
          setStatus("buildError");
          return null;
        }
        if (response.status === 404) {
          setStatus("unavailable");
          return null;
        }
        if (!response.ok) throw new Error("Model request failed");
        return (await response.json()) as ModelGeometry;
      })
      .then((model) => {
        if (controller.signal.aborted) return;
        if (!model) return;
        const primitiveSize = model.kind === "toolpath" ? 6 : 9;
        if (!Array.isArray(model.positions) || !Array.isArray(model.colors) ||
          model.positions.length < primitiveSize || model.positions.length % primitiveSize !== 0 ||
          model.colors.length !== model.positions.length / primitiveSize ||
          !model.positions.every(Number.isFinite) ||
          [model.widths, model.heights].some((values) => values !== undefined &&
            (!Array.isArray(values) || values.length !== model.colors.length ||
              !values.every((value) => Number.isFinite(value) && value > 0)))) {
          throw new Error("Invalid model geometry");
        }
        setGeometry(model);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load preview:", error);
        setStatus("error");
      });
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [mode, printId, geometry, retryVersion]);

  async function retryPreview() {
    setStatus("computing");
    try {
      const response = await fetch(`/api/prints/${encodeURIComponent(printId)}/model`, { method: "POST" });
      if (!response.ok) throw new Error("Could not restart preview calculation.");
      setStatus("computing");
      setRetryVersion((version) => version + 1);
    } catch (error) {
      console.error("Failed to restart preview calculation:", error);
      setStatus("error");
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry || geometry.kind !== "toolpath") return;
    let renderer: ReturnType<typeof createToolpathRenderer> | undefined;
    let frame = 0;
    let failed = false;
    const render = () => {
      if (frame || failed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          renderer ??= createToolpathRenderer(canvas, geometry);
          renderer.draw(cameraRef.current);
        } catch (error) {
          failed = true;
          console.error("Failed to render complete toolpath preview:", error);
          setStatus("error");
        };
      });
    }
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      cameraRef.current.zoom = Math.max(0.5, Math.min(3.5, cameraRef.current.zoom * Math.exp(-event.deltaY * 0.001)));
      render();
    }
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    drawRef.current = render;
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", handleWheel);
      renderer?.dispose();
      drawRef.current = () => {};
    };
  }, [geometry, mode, status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry || geometry.kind === "toolpath") return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const positions = geometry.positions;
    const min: Point3D = [Infinity, Infinity, Infinity];
    const max: Point3D = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < positions.length; index++) {
      const axis = index % 3;
      min[axis] = Math.min(min[axis], positions[index]);
      max[axis] = Math.max(max[axis], positions[index]);
    }
    const center: Point3D = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
    const largestSpan = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.001);
    const faces: Face[] = [];

    const offsets = [0, 3, 6];
    const primitiveSize = offsets.length * 3;
    for (let index = 0, faceIndex = 0; index + primitiveSize <= positions.length; index += primitiveSize, faceIndex += 1) {
      const points = offsets.map((offset) => [
        (positions[index + offset] - center[0]) / largestSpan,
        (positions[index + offset + 1] - center[1]) / largestSpan,
        (positions[index + offset + 2] - center[2]) / largestSpan,
      ] as Point3D) as Face["points"];
      faces.push({ points, color: geometry.colors[faceIndex] ?? "#94a3b8" });
    }

    const paint = () => {
      const pixelRatio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const { pitch, yaw, zoom } = cameraRef.current;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const scale = Math.min(width, height) * 0.76 * zoom;
      const projected = faces.map((face) => {
        const rotated = face.points.map(([x, y, z]) => {
          const turnedX = x * cosYaw + z * sinYaw;
          const turnedZ = -x * sinYaw + z * cosYaw;
          return [
            turnedX,
            y * cosPitch - turnedZ * sinPitch,
            y * sinPitch + turnedZ * cosPitch,
          ] as Point3D;
        }) as Face["points"];
        const [a, b, c = b] = rotated;
        const normal: Point3D = [
          (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
          (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
        ];
        const length = Math.hypot(...normal) || 1;
        const light = Math.max(0, (normal[0] * 0.35 + normal[1] * 0.65 + normal[2] * 0.68) / length);
        return {
          points: rotated.map(([x, y, z]) => [width / 2 + x * scale, height / 2 - y * scale, z] as [number, number, number]),
          depth: rotated.reduce((total, point) => total + point[2], 0) / rotated.length,
          fill: colorWithLight(face.color, 0.42 + light * 0.58),
        };
      });

      projected.sort((left, right) => left.depth - right.depth);
      context.lineWidth = 0.45;
      context.strokeStyle = "rgba(15, 23, 42, 0.2)";
      for (const face of projected) {
        context.beginPath();
        context.moveTo(face.points[0][0], face.points[0][1]);
        context.lineTo(face.points[1][0], face.points[1][1]);
        context.lineTo(face.points[2][0], face.points[2][1]);
        context.closePath();
        context.fillStyle = face.fill;
        context.fill();
        context.stroke();
      }
    };

    let frame = 0;
    function render() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    }

    drawRef.current = render;
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      cameraRef.current.zoom = Math.max(0.5, Math.min(3.5, cameraRef.current.zoom * Math.exp(-event.deltaY * 0.001)));
      render();
    }
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", handleWheel);
      cancelAnimationFrame(frame);
      drawRef.current = () => {};
    };
  }, [geometry, mode, status]);

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const previous = dragRef.current;
    if (!previous) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    cameraRef.current.yaw += deltaX * 0.009;
    cameraRef.current.pitch = Math.max(-1.45, Math.min(1.45, cameraRef.current.pitch + deltaY * 0.009));
    dragRef.current = { x: event.clientX, y: event.clientY };
    drawRef.current();
  }

  function resetView() {
    cameraRef.current = { pitch: -0.48, yaw: 0.62, zoom: 1 };
    drawRef.current();
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      {allow3d && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 dark:bg-slate-900" role="group" aria-label={t("print.modelCanvas")}>
            {thumbnail && (
              <button
                type="button"
                aria-pressed={mode === "2d"}
                onClick={() => setMode("2d")}
                className={`rounded px-3 py-1 text-sm font-medium ${mode === "2d" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                {t("print.view2d")}
              </button>
            )}
            {allow3d && (
              <button
                type="button"
                aria-pressed={mode === "3d"}
                onClick={() => setMode("3d")}
                className={`rounded px-3 py-1 text-sm font-medium ${mode === "3d" ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}
              >
                {t("print.view3d")}
              </button>
            )}
          </div>
          {mode === "3d" && status === "ready" && (
            <button type="button" onClick={resetView} className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100">
              {t("print.resetView")}
            </button>
          )}
        </div>
      )}

      {mode === "3d" && status === "ready" && geometry?.kind === "toolpath" && (
        <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{t("print.toolpathPreviewNote")}</p>
      )}
      {mode === "2d" && thumbnail ? (
        <div className="flex min-h-72 items-center justify-center bg-white p-3 dark:bg-slate-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnail} alt={alt} className="max-h-[360px] max-w-full object-contain" />
        </div>
      ) : mode === "3d" && status === "ready" ? (
        <canvas
          ref={canvasRef}
          aria-label={t("print.modelCanvas")}
          onPointerDown={(event) => {
            dragRef.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          className="block h-[360px] w-full touch-none cursor-grab bg-slate-50 active:cursor-grabbing dark:bg-slate-900"
        />
      ) : mode === "3d" ? (
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-500 dark:text-slate-400" role="status">
          {status === "idle"
            ? t("print.modelLoading")
            : status === "computing"
              ? t("print.modelComputing")
              : status === "buildError"
                ? t("print.modelComputeError")
            : status === "unavailable"
              ? t("print.modelUnavailable")
              : t("print.modelLoadError")}
          {status === "buildError" && (
            <button type="button" onClick={() => void retryPreview()} className="rounded-lg bg-orange-500 px-3 py-2 font-medium text-white hover:bg-orange-600">
              {t("print.modelRetry")}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}