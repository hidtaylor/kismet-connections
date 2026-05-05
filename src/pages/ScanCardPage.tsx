import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowLeft, Camera, Check, Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Parsed = {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  emails?: string[];
  phones?: string[];
  website?: string;
  address?: string;
  linkedin?: string;
  raw_text?: string;
};

type Status = "idle" | "uploading" | "parsing" | "done" | "error";
type ErrorStep = "upload" | "parse" | null;

const STEPS: { key: "uploading" | "parsing" | "done"; label: string }[] = [
  { key: "uploading", label: "Uploading" },
  { key: "parsing", label: "Parsing" },
  { key: "done", label: "Ready to review" },
];

// Auto-capture quality thresholds
const SHARPNESS_MIN = 120;       // variance of Laplacian
const LUMA_MIN = 50;
const LUMA_MAX = 220;
const EDGE_DENSITY_MIN = 0.04;
const PASSES_REQUIRED = 3;

export default function ScanCardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const passesRef = useRef(0);
  const capturedRef = useRef(false);
  const startingRef = useRef(false);

  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hint, setHint] = useState<string>("Looking for card…");
  const [flash, setFlash] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [errorStep, setErrorStep] = useState<ErrorStep>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Animate indeterminate progress bar while in uploading/parsing
  useEffect(() => {
    if (status !== "uploading" && status !== "parsing") {
      setProgress(status === "done" ? 100 : 0);
      return;
    }
    setProgress(10);
    const id = window.setInterval(() => {
      setProgress((p) => (p < 90 ? p + (90 - p) * 0.15 : p));
    }, 300);
    return () => window.clearInterval(id);
  }, [status]);

  async function startCamera() {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = s;
      setPermissionDenied(false);
      setStreaming(true);
    } catch (err: any) {
      setPermissionDenied(true);
      toast.error(err?.message ?? "Camera permission denied");
    } finally {
      startingRef.current = false;
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }

  // Auto-open camera on mount
  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause camera when tab hidden, resume when visible (and no snapshot yet)
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        stopCamera();
      } else if (!snapshot && !capturedRef.current) {
        startCamera();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [snapshot]);

  // Attach the stream once the <video> element is mounted
  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [streaming]);

  // Auto-capture loop: analyze frames for sharpness/lighting/edges
  useEffect(() => {
    if (!streaming || snapshot || capturedRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    passesRef.current = 0;

    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement("canvas");
    }
    const canvas = analysisCanvasRef.current;
    const W = 320;
    const H = 214;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const tick = () => {
      if (cancelled || capturedRef.current) return;
      if (video.readyState < 2 || video.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Center-crop the video into our small analysis canvas
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetAspect = W / H;
      const videoAspect = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (videoAspect > targetAspect) {
        sw = vh * targetAspect;
        sx = (vw - sw) / 2;
      } else {
        sh = vw / targetAspect;
        sy = (vh - sh) / 2;
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      const img = ctx.getImageData(0, 0, W, H).data;

      // Compute grayscale + luma stats
      const gray = new Float32Array(W * H);
      let lumaSum = 0;
      for (let i = 0, p = 0; i < img.length; i += 4, p++) {
        const y = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
        gray[p] = y;
        lumaSum += y;
      }
      const lumaMean = lumaSum / (W * H);

      // Laplacian variance (sharpness) + edge density
      let lapSum = 0, lapSqSum = 0, edgeCount = 0, n = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const lap =
            -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - W] + gray[i + W];
          lapSum += lap;
          lapSqSum += lap * lap;
          if (Math.abs(lap) > 25) edgeCount++;
          n++;
        }
      }
      const lapMean = lapSum / n;
      const sharpness = lapSqSum / n - lapMean * lapMean;
      const edgeDensity = edgeCount / n;

      const lightingOk = lumaMean >= LUMA_MIN && lumaMean <= LUMA_MAX;
      const sharpOk = sharpness >= SHARPNESS_MIN;
      const framedOk = edgeDensity >= EDGE_DENSITY_MIN;

      if (!lightingOk) {
        passesRef.current = 0;
        setHint(lumaMean < LUMA_MIN ? "Need more light…" : "Too bright…");
      } else if (!framedOk) {
        passesRef.current = 0;
        setHint("Move closer to the card…");
      } else if (!sharpOk) {
        passesRef.current = 0;
        setHint("Hold steady…");
      } else {
        passesRef.current += 1;
        setHint("Hold steady…");
        if (passesRef.current >= PASSES_REQUIRED) {
          capturedRef.current = true;
          setHint("Captured");
          setFlash(true);
          window.setTimeout(() => setFlash(false), 200);
          snapAndProcess();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, snapshot]);

  function snapAndProcess() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (!b) return;
      setSnapshotBlob(b);
      setSnapshot(URL.createObjectURL(b));
      stopCamera();
      // Kick off pipeline immediately
      runFrom("upload", b);
    }, "image/jpeg", 0.92);
  }

  function manualSnap() {
    capturedRef.current = true;
    snapAndProcess();
  }

  function reset() {
    setSnapshot(null);
    setSnapshotBlob(null);
    setStoragePath(null);
    setStatus("idle");
    setErrorStep(null);
    setErrorMessage(null);
    setHint("Looking for card…");
    capturedRef.current = false;
    passesRef.current = 0;
    startCamera();
  }

  function handleFile(f: File) {
    capturedRef.current = true;
    stopCamera();
    setSnapshotBlob(f);
    setSnapshot(URL.createObjectURL(f));
    setStoragePath(null);
    setStatus("idle");
    setErrorStep(null);
    setErrorMessage(null);
    runFrom("upload", f);
  }

  function friendlyError(msg: string | undefined): string {
    if (!msg) return "Something went wrong. Please try again.";
    const m = msg.toLowerCase();
    if (m.includes("rate")) return "Too many requests right now. Please wait a moment and retry.";
    if (m.includes("credit")) return "AI credits are exhausted. Please try again later.";
    if (m.includes("forbidden")) return "Permission denied for this image. Please retake and try again.";
    if (m.includes("unauth")) return "Your session expired. Please sign in again.";
    return msg;
  }

  async function doUpload(blob: Blob): Promise<string> {
    if (!user) throw new Error("Not signed in");
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const upload = await supabase.storage.from("card-images").upload(path, blob, {
      contentType: blob.type || "image/jpeg",
    });
    if (upload.error) throw upload.error;
    setStoragePath(path);
    return path;
  }

  async function doParse(path: string): Promise<Parsed> {
    const { data, error } = await supabase.functions.invoke("scan-card", {
      body: { storage_path: path },
    });
    if (error) throw error;
    return (data?.parsed ?? {}) as Parsed;
  }

  function goToPrefill(parsed: Parsed) {
    const prefill = encodeURIComponent(JSON.stringify({
      full_name: parsed.full_name ?? [parsed.first_name, parsed.last_name].filter(Boolean).join(" "),
      first_name: parsed.first_name ?? "",
      last_name: parsed.last_name ?? "",
      company: parsed.company ?? "",
      title: parsed.title ?? "",
      emails: parsed.emails ?? [],
      phones: parsed.phones ?? [],
      website_url: parsed.website ?? "",
      location: parsed.address ?? "",
      linkedin_url: parsed.linkedin ?? "",
    }));
    navigate(`/contact/new?prefill=${prefill}`);
  }

  async function runFrom(step: "upload" | "parse", blobOverride?: Blob) {
    setErrorStep(null);
    setErrorMessage(null);
    try {
      let path = storagePath;
      if (step === "upload" || !path) {
        setStatus("uploading");
        const blob = blobOverride ?? snapshotBlob;
        if (!blob) throw new Error("Missing image");
        path = await doUpload(blob);
      }
      setStatus("parsing");
      const parsed = await doParse(path!);
      setStatus("done");
      setTimeout(() => goToPrefill(parsed), 450);
    } catch (e: any) {
      const failedStep: ErrorStep = status === "uploading" || step === "upload" ? "upload" : "parse";
      setErrorStep(failedStep);
      setErrorMessage(friendlyError(e?.message));
      setStatus("error");
    }
  }

  const processing = status === "uploading" || status === "parsing" || status === "done";
  const showStepper = processing || status === "error";

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-sm font-medium">Scan business card</h1>
        <div className="w-10" />
      </header>

      <div className="px-4 py-5">
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-black">
          {snapshot ? (
            <img src={snapshot} alt="Card preview" className="h-full w-full object-cover" />
          ) : streaming ? (
            <>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              {/* Framing guides */}
              <div className="pointer-events-none absolute inset-4 rounded-md border-2 border-white/60" />
              {/* Live hint */}
              {!showStepper && (
                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  {hint}
                </div>
              )}
              {/* Capture flash */}
              <div className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-200", flash ? "opacity-80" : "opacity-0")} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {permissionDenied
                ? "Camera permission was denied. Use Upload, or allow camera access and retry."
                : "Starting camera…"}
            </div>
          )}
        </div>

        {showStepper && (
          <div className="mt-5 space-y-3">
            <Stepper status={status} errorStep={errorStep} />
            <Progress value={status === "error" ? 100 : progress} className={cn("h-1", status === "error" && "[&>div]:bg-destructive")} />
            {status === "error" && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="leading-relaxed">{errorMessage}</p>
              </div>
            )}
            {status === "error" && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} className="flex-1">
                  <RotateCcw className="mr-2 h-4 w-4" /> Retake photo
                </Button>
                <Button onClick={() => runFrom(errorStep ?? "upload")} className="flex-1">
                  <Sparkles className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {!showStepper && (
          <div className="mt-4 flex gap-2">
            {streaming && !snapshot && (
              <>
                <Button onClick={manualSnap} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" /> Capture now
                </Button>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-card px-3 text-sm">
                  <Upload className="h-4 w-4" />
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </label>
              </>
            )}
            {!streaming && !snapshot && (
              <>
                <Button onClick={startCamera} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" /> Open camera
                </Button>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-input bg-card px-3 text-sm">
                  <Upload className="h-4 w-4" />
                  <input
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </label>
              </>
            )}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground text-balance">
          Point the camera at the card and hold steady — it captures automatically when the image is sharp.
        </p>
      </div>
    </div>
  );
}

function Stepper({ status, errorStep }: { status: Status; errorStep: ErrorStep }) {
  const stepState = (idx: number): "pending" | "active" | "done" | "error" => {
    const stepKey = STEPS[idx].key;
    if (status === "error") {
      if (errorStep === "upload" && stepKey === "uploading") return "error";
      if (errorStep === "parse" && stepKey === "parsing") return "error";
      if (errorStep === "parse" && stepKey === "uploading") return "done";
      return "pending";
    }
    if (status === "done") return "done";
    if (status === "uploading") return stepKey === "uploading" ? "active" : "pending";
    if (status === "parsing") {
      if (stepKey === "uploading") return "done";
      if (stepKey === "parsing") return "active";
      return "pending";
    }
    return "pending";
  };

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const s = stepState(i);
        return (
          <div key={step.key} className="flex flex-1 items-center gap-2">
            <StepDot state={s} />
            <span
              className={cn(
                "text-xs font-medium truncate",
                s === "active" && "text-foreground",
                s === "done" && "text-foreground",
                s === "pending" && "text-muted-foreground",
                s === "error" && "text-destructive",
              )}
              aria-current={s === "active" ? "step" : undefined}
            >
              {s === "error"
                ? step.key === "uploading" ? "Upload failed" : "Parsing failed"
                : step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-px flex-1",
                s === "done" ? "bg-primary" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepDot({ state }: { state: "pending" | "active" | "done" | "error" }) {
  if (state === "done") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-3 w-3" />
      </div>
    );
  }
  if (state === "active") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
        <AlertCircle className="h-3 w-3" />
      </div>
    );
  }
  return <div className="h-5 w-5 rounded-full border border-border bg-muted" />;
}
