import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Camera, RotateCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

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

export default function ScanCardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null); // dataUrl
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [parsing, setParsing] = useState(false);

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setStreaming(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Camera permission denied");
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }
  useEffect(() => () => stopCamera(), []);

  function snap() {
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
    }, "image/jpeg", 0.9);
  }

  function reset() {
    setSnapshot(null);
    setSnapshotBlob(null);
    startCamera();
  }

  function handleFile(f: File) {
    setSnapshotBlob(f);
    setSnapshot(URL.createObjectURL(f));
  }

  async function process() {
    if (!user || !snapshotBlob) return;
    setParsing(true);
    try {
      // 1. Upload to storage
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const upload = await supabase.storage.from("card-images").upload(path, snapshotBlob, {
        contentType: snapshotBlob.type || "image/jpeg",
      });
      if (upload.error) throw upload.error;

      // 2. Get signed URL for AI to fetch
      const { data: signed } = await supabase.storage.from("card-images").createSignedUrl(path, 60 * 5);
      if (!signed?.signedUrl) throw new Error("Could not sign image");

      // 3. Call edge function
      const { data, error } = await supabase.functions.invoke("scan-card", {
        body: { image_url: signed.signedUrl, storage_path: path },
      });
      if (error) throw error;
      const parsed: Parsed = data?.parsed ?? {};

      // 4. Pre-fill the new contact form
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
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to scan");
    } finally {
      setParsing(false);
    }
  }

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
        <div className="aspect-[3/2] w-full overflow-hidden rounded-lg bg-black">
          {snapshot ? (
            <img src={snapshot} alt="Card preview" className="h-full w-full object-cover" />
          ) : streaming ? (
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Tap "Open camera" to start
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {!snapshot && !streaming && (
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
          {streaming && (
            <Button onClick={snap} className="flex-1">
              <Camera className="mr-2 h-4 w-4" /> Capture
            </Button>
          )}
          {snapshot && (
            <>
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Retake
              </Button>
              <Button onClick={process} disabled={parsing} className="flex-1">
                <Sparkles className="mr-2 h-4 w-4" />
                {parsing ? "Reading…" : "Read card"}
              </Button>
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground text-balance">
          Hold the card flat with good light. After parsing, you'll review and confirm the fields before saving.
        </p>
      </div>
    </div>
  );
}
