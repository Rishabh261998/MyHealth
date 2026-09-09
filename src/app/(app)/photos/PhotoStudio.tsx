"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Camera, Loader2, Sparkles, Trash2 } from "lucide-react";
import Empty from "@/components/Empty";
import { prettyDate } from "@/lib/dates";
import { fmtWeight } from "@/lib/units";
import { analyzePhotos, deletePhoto, uploadPhoto } from "./actions";

type Photo = {
  id: number;
  date: string;
  pose: string;
  dataUrl: string;
  weightKg: number | null;
  notes: string;
};

type Analysis = {
  id: number;
  photoId: number | null;
  comparePhotoId: number | null;
  summary: string;
  createdAt: string;
};

const POSES = ["front", "side", "back"] as const;
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.78;

/** Shrink on the phone so we never ship a 6 MB camera file to the server. */
async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export default function PhotoStudio({
  today,
  unit,
  photos,
  analyses,
  aiEnabled,
}: {
  today: string;
  unit: string;
  photos: Photo[];
  analyses: Analysis[];
  aiEnabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pose, setPose] = useState<(typeof POSES)[number]>("front");
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [, startDelete] = useTransition();

  const byPose = useMemo(() => photos.filter((p) => p.pose === pose), [photos, pose]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      await uploadPhoto({ date, pose, dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id].slice(-2),
    );

  const runAnalysis = () => {
    if (selected.length === 0) return;
    setResult(null);
    setError("");
    // Newest photo is the "after"; the other one, if any, is the "before".
    const chosen = selected
      .map((id) => photos.find((p) => p.id === id)!)
      .sort((a, b) => a.date.localeCompare(b.date));
    const later = chosen.at(-1)!;
    const earlier = chosen.length > 1 ? chosen[0] : undefined;

    startAnalyze(async () => {
      const res = await analyzePhotos(later.id, earlier?.id);
      if (res.ok) setResult(res.summary);
      else setError(res.error);
    });
  };

  return (
    <>
      <section className="card">
        <div className="mb-3 flex gap-1.5">
          {POSES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPose(p)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium capitalize ${
                p === pose
                  ? "border-brand bg-[var(--brand-soft)] text-brand"
                  : "border-line bg-surface2 text-muted"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="photo-date">
              Date
            </label>
            <input
              id="photo-date"
              type="date"
              className="input"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {busy ? "Saving…" : "Take / choose"}
            </button>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <p className="mt-3 text-xs text-muted">
          Same spot, same light, same time of day — that is what makes two photos comparable.
          Images are shrunk on your phone before upload and only ever stored in your own database.
        </p>
      </section>

      {error && (
        <p className="mt-3 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm text-[var(--bad)]">
          {error}
        </p>
      )}

      {/* ------------------------------------------------------- AI panel */}
      <section className="card mt-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand" />
          <h2 className="font-semibold">AI check-in</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          {aiEnabled
            ? "Select one photo for a read, or two to compare before and after."
            : "Add an ANTHROPIC_API_KEY to your deployment to switch this on. Everything else works without it."}
        </p>

        {selected.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {selected.length === 1 ? "1 photo selected" : "2 photos selected — comparing"}
          </p>
        )}

        <button
          type="button"
          onClick={runAnalysis}
          disabled={!aiEnabled || selected.length === 0 || analyzing}
          className="btn-primary mt-3 w-full"
        >
          {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {analyzing ? "Looking at your photos…" : "Analyze"}
        </button>

        {result && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-line bg-surface2 p-3 text-sm leading-relaxed">
            {result}
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          This is a training observation from a photo, not a medical or body-composition
          assessment. For anything health-related, talk to a doctor.
        </p>
      </section>

      {/* --------------------------------------------------------- gallery */}
      <h2 className="h-section mb-2 mt-6 capitalize">{pose} photos</h2>
      {byPose.length === 0 ? (
        <Empty
          title="No photos in this pose yet"
          hint="Take the first one today — it becomes your baseline."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {byPose.map((p) => {
            const isSelected = selected.includes(p.id);
            return (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`relative block w-full ${isSelected ? "ring-2 ring-brand" : ""}`}
                  aria-pressed={isSelected}
                >
                  <Image
                    src={p.dataUrl}
                    alt={`${p.pose} photo from ${prettyDate(p.date)}`}
                    width={512}
                    height={683}
                    unoptimized
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {isSelected && (
                    <span className="absolute right-2 top-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">
                      selected
                    </span>
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{prettyDate(p.date)}</p>
                    {p.weightKg != null && (
                      <p className="text-[11px] tabular-nums text-muted">
                        {fmtWeight(p.weightKg, unit)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Delete photo"
                    onClick={() => {
                      if (confirm("Delete this photo?")) {
                        startDelete(() => {
                          void deletePhoto(p.id);
                        });
                      }
                    }}
                    className="shrink-0 text-muted"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {analyses.length > 0 && (
        <>
          <h2 className="h-section mb-2 mt-6">Past check-ins</h2>
          <ul className="space-y-2">
            {analyses.map((a) => (
              <li key={a.id} className="card">
                <p className="text-xs text-muted">
                  {new Date(a.createdAt).toLocaleDateString()}
                  {a.comparePhotoId ? " · comparison" : " · single photo"}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{a.summary}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
