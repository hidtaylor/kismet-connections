import { useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "stopped";

/** A small MediaRecorder hook with a basic level meter for waveform UI. */
export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Pick a supported mime
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
      : "audio/webm";
    const mr = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    mr.onstop = () => {
      const out = new Blob(chunksRef.current, { type: mime });
      setBlob(out);
      setState("stopped");
    };
    mr.start();
    mrRef.current = mr;
    startedAt.current = Date.now();
    setState("recording");
    setBlob(null);
    setDuration(0);

    // Level meter
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    analyserRef.current = an;

    const data = new Uint8Array(an.frequencyBinCount);
    const tick = () => {
      an.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      setLevel(Math.min(1, sum / (data.length * 140)));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    tickRef.current = window.setInterval(() => {
      setDuration(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);
  }

  function stop() {
    mrRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setLevel(0);
  }

  function reset() {
    stop();
    setBlob(null);
    setDuration(0);
    setState("idle");
  }

  useEffect(() => () => stop(), []);

  return { state, blob, duration, level, start, stop, reset };
}

/** A simple waveform visualization. */
export function LevelMeter({ level, recording }: { level: number; recording: boolean }) {
  const bars = 32;
  return (
    <div className="flex items-end gap-1 h-20">
      {Array.from({ length: bars }).map((_, i) => {
        const phase = (Math.sin(i * 0.7 + Date.now() / 200) + 1) / 2;
        const h = recording
          ? Math.max(4, level * 80 * (0.5 + 0.5 * phase))
          : 4;
        return (
          <span
            key={i}
            className="w-1.5 rounded-sm bg-primary/80 transition-[height] duration-100"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
