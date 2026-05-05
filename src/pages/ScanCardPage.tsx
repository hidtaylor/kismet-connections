import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, ArrowLeft, Camera, Check, Loader2, Plus, RotateCcw, Sparkles, Upload } from "lucide-react";
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
type Side = "front" | "back";

const STEPS: { key: "uploading" | "parsing" | "done"; label: string }[] = [
  { key: "uploading", label: "Uploading" },
  { key: "parsing", label: "Parsing" },
  { key: "done", label: "Ready to review" },
];

// Auto-capture quality thresholds (tuned to avoid premature snaps)
const SHARPNESS_MIN = 250;
const LUMA_MIN = 60;
const LUMA_MAX = 215;
const LUMA_STD_MIN = 18;
const EDGE_DENSITY_MIN = 0.07;
const QUADRANT_EDGE_MIN = 0.03;
const PASSES_REQUIRED = 8;
const WARMUP_MS = 1500;
const MOTION_MAX = 12;

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

  // Per-side capture state
  const [frontBlob, setFrontBlob] = useState<Blob | null>(null);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [backBlob, setBackBlob] = useState<Blob | null>(null);
  const [backUrl, setBackUrl] = useState<string | null>(null);
  const [activeSide, setActiveSide] = useState<Side>("front");
  // "review" = front captured, prompting to add back or finish
  // "capturing" = camera open and (auto-)capturing the activeSide
  const [phase, setPhase] = useState<"capturing" | "review">("capturing");

  const [streaming, setStreaming] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hint, setHint] = useState<string>("Looking for card…");
  const [flash, setFlash] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [errorStep, setErrorStep] = useState<ErrorStep>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [storagePaths, setStoragePaths] = useState<string[] | null>(null);
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

  // Pause camera when tab hidden, resume when capturing
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        stopCamera();
      } else if (phase === "capturing" && !capturedRef.current) {
        startCamera();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  // Attach the stream once the <video> element is mounted
  useEffect(() => {
    if (streaming && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [streaming]);

  // Auto-capture loop: analyze frames for sharpness/lighting/edges/motion
  useEffect(() => {
    if (!streaming || phase !== "capturing" || capturedRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    passesRef.current = 0;
    const startedAt = performance.now();
    let prevGray: Float32Array | null = null;

    if (!analysisCanvasRef.current) analysisCanvasRef.current = document.createElement("canvas");
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

      if (performance.now() - startedAt < WARMUP_MS) {
        setHint("Adjusting camera…");
        passesRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const targetAspect = W / H;
      const videoAspect = vw / vh;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (videoAspect > targetAspect) { sw = vh * targetAspect; sx = (vw - sw) / 2; }
      else { sh = vw / targetAspect; sy = (vh - sh) / 2; }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      const img = ctx.getImageData(0, 0, W, H).data;

      const gray = new Float32Array(W * H);
      let lumaSum = 0;
      for (let i = 0, p = 0; i < img.length; i += 4, p++) {
        const y = 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
        gray[p] = y;
        lumaSum += y;
      }
      const lumaMean = lumaSum / (W * H);
      let lumaVar = 0;
      for (let p = 0; p < gray.length; p++) { const d = gray[p] - lumaMean; lumaVar += d * d; }
      const lumaStd = Math.sqrt(lumaVar / gray.length);

      let motion = Infinity;
      if (prevGray) {
        let diffSum = 0;
        for (let p = 0; p < gray.length; p++) diffSum += Math.abs(gray[p] - prevGray[p]);
        motion = diffSum / gray.length;
      }
      prevGray = gray;

      let lapSum = 0, lapSqSum = 0, n = 0;
      const qEdges = [0, 0, 0, 0];
      const qCounts = [0, 0, 0, 0];
      const midX = W / 2, midY = H / 2;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const lap = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - W] + gray[i + W];
          lapSum += lap;
          lapSqSum += lap * lap;
          const q = (y < midY ? 0 : 2) + (x < midX ? 0 : 1);
          qCounts[q]++;
          if (Math.abs(lap) > 25) qEdges[q]++;
          n++;
        }
      }
      const lapMean = lapSum / n;
      const sharpness = lapSqSum / n - lapMean * lapMean;
      const totalEdges = qEdges.reduce((a, b) => a + b, 0);
      const edgeDensity = totalEdges / n;
      const minQuadrant = Math.min(
        qEdges[0] / qCounts[0], qEdges[1] / qCounts[1],
        qEdges[2] / qCounts[2], qEdges[3] / qCounts[3],
      );

      const lightingOk = lumaMean >= LUMA_MIN && lumaMean <= LUMA_MAX;
      const notBlank = lumaStd >= LUMA_STD_MIN;
      const framedOk = edgeDensity >= EDGE_DENSITY_MIN && minQuadrant >= QUADRANT_EDGE_MIN;
      const steadyOk = motion <= MOTION_MAX;
      const sharpOk = sharpness >= SHARPNESS_MIN;

      if (!lightingOk) { passesRef.current = 0; setHint(lumaMean < LUMA_MIN ? "Need more light…" : "Too bright…"); }
      else if (!notBlank) { passesRef.current = 0; setHint("Point at a card…"); }
      else if (!framedOk) { passesRef.current = 0; setHint("Center the card in the frame…"); }
      else if (!steadyOk) { passesRef.current = 0; setHint("Hold steady…"); }
      else if (!sharpOk) { passesRef.current = 0; setHint("Focusing…"); }
      else {
        passesRef.current += 1;
        setHint("Hold steady…");
        if (passesRef.current >= PASSES_REQUIRED) {
          capturedRef.current = true;
          setHint("Captured");
          setFlash(true);
          window.setTimeout(() => setFlash(false), 200);
          snapCurrentSide();
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
  }, [streaming, phase]);

  function snapCurrentSide() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      const side = activeSide;
      stopCamera();
      if (side === "front") {
        setFrontBlob(b);
        setFrontUrl(url);
        setPhase("review");
      } else {
        setBackBlob(b);
        setBackUrl(url);
        // Auto-run pipeline as soon as back is captured
        runPipeline(frontBlob!, b);
      }
    }, "image/jpeg", 0.92);
  }

  function manualSnap() {
    capturedRef.current = true;
    snapCurrentSide();
  }

  function startSideCapture(side: Side) {
    setActiveSide(side);
    setPhase("capturing");
    setHint("Looking for card…");
    capturedRef.current = false;
    passesRef.current = 0;
    startCamera();
  }

  function retakeFront() {
    if (frontUrl) URL.revokeObjectURL(frontUrl);
    setFrontBlob(null);
    setFrontUrl(null);
    startSideCapture("front");
  }

  function retakeBack() {
    if (backUrl) URL.revokeObjectURL(backUrl);
    setBackBlob(null);
    setBackUrl(null);
    startSideCapture("back");
  }

  function handleFile(f: File) {
    capturedRef.current = true;
    stopCamera();
    const url = URL.createObjectURL(f);
    if (activeSide === "front") {
      setFrontBlob(f);
      setFrontUrl(url);
      setPhase("review");
    } else {
      setBackBlob(f);
      setBackUrl(url);
      runPipeline(frontBlob!, f);
    }
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

  async function uploadOne(blob: Blob): Promise<string> {
    if (!user) throw new Error("Not signed in");
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const upload = await supabase.storage.from("card-images").upload(path, blob, {
      contentType: blob.type || "image/jpeg",
    });
    if (upload.error) throw upload.error;
    return path;
  }

  async function doParse(paths: string[]): Promise<Parsed> {
    const { data, error } = await supabase.functions.invoke("scan-card", {
      body: { storage_paths: paths },
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

  async function runPipeline(front: Blob, back: Blob | null) {
    setErrorStep(null);
    setErrorMessage(null);
    setStatus("uploading");
    try {
      let paths = storagePaths;
      if (!paths) {
        const blobs = back ? [front, back] : [front];
        paths = [];
        for (const b of blobs) paths.push(await uploadOne(b));
        setStoragePaths(paths);
      }
      setStatus("parsing");
      const parsed = await doParse(paths);
      setStatus("done");
      setTimeout(() => goToPrefill(parsed), 450);
    } catch (e: any) {
      const failedStep: ErrorStep = status === "parsing" ? "parse" : "upload";
      setErrorStep(failedStep);
      setErrorMessage(friendlyError(e?.message));
      setStatus("error");
    }
  }

  function finishWithFrontOnly() {
    if (!frontBlob) return;
    runPipeline(frontBlob, null);
  }

  function fullReset() {
    if (frontUrl) URL.revokeObjectURL(frontUrl);
    if (backUrl) URL.revokeObjectURL(backUrl);
    setFrontBlob(null); setFrontUrl(null);
    setBackBlob(null); setBackUrl(null);
    setStoragePaths(null);
    setStatus("idle");
    setErrorStep(null);
    setErrorMessage(null);
    setHint("Looking for card…");
    capturedRef.current = false;
    passesRef.current = 0;
    setActiveSide("front");
    setPhase("capturing");
    startCamera();
  }

  const processing = status === "uploading" || status === "parsing" || status === "done";
  const showStepper = processing || status === "error";
  const inReview = phase === "review" && !showStepper;

  return (
    <div className="mx-auto w-full max-w-md">
      <header
        className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-2 py-2 backdrop-blur-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.25rem)" }}
      >
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-sm font-medium">
          {inReview ? "Front captured" : activeSide === "back" ? "Scan back of card" : "Scan business card"}
        </h1>
        <div className="w-10" />
      </header>

      <div className="px-4 py-5">
        {/* Live camera / preview area */}
        <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-black">
          {inReview && frontUrl ? (
            <img src={frontUrl} alt="Front of card" className="h-full w-full object-cover" />
          ) : showStepper ? (
            <img
              src={(activeSide === "back" && backUrl) ? backUrl : (frontUrl ?? "")}
              alt="Card preview"
              className="h-full w-full object-cover"
            />
          ) : streaming ? (
            <>
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-4 rounded-md border-2 border-white/60" />
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                {activeSide === "front" ? "Front" : "Back"}
              </div>
              <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                {hint}
              </div>
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

        {/* Review state: front captured, choose to add back or finish */}
        {inReview && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground text-balance">
              Got the front. If the card has info on the back (extra address, phone, email), scan it too.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={retakeFront} className="flex-1">
                <RotateCcw className="mr-2 h-4 w-4" /> Retake front
              </Button>
              <Button onClick={() => startSideCapture("back")} className="flex-1">
                <Plus className="mr-2 h-4 w-4" /> Add back side
              </Button>
            </div>
            <Button variant="secondary" onClick={finishWithFrontOnly} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" /> Use front only
            </Button>
          </div>
        )}

        {/* Stepper / processing */}
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
                <Button variant="outline" onClick={fullReset} className="flex-1">
                  <RotateCcw className="mr-2 h-4 w-4" /> Start over
                </Button>
                <Button onClick={() => runPipeline(frontBlob!, backBlob)} className="flex-1">
                  <Sparkles className="mr-2 h-4 w-4" /> Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Capturing controls */}
        {!showStepper && !inReview && (
          <div className="mt-4 flex gap-2">
            {streaming && (
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
            {!streaming && (
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
            {activeSide === "back" && (
              <Button variant="ghost" onClick={retakeBack} className="shrink-0">
                Skip
              </Button>
            )}
          </div>
        )}

        {!showStepper && !inReview && (
          <p className="mt-4 text-xs text-muted-foreground text-balance">
            {activeSide === "front"
              ? "Point the camera at the card and hold steady — it captures automatically when sharp."
              : "Flip the card and point at the back — it captures automatically when sharp."}
          </p>
        )}
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
              <div className={cn("h-px flex-1", s === "done" ? "bg-primary" : "bg-border")} />
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
