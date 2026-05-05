import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SOURCE_LABEL: Record<string, string> = {
  card_scan: "Scanned",
  pdl: "PDL",
  zerobounce: "ZeroBounce",
  twilio: "Twilio",
  proxycurl: "Proxycurl",
  clearbit: "Clearbit",
  apollo: "Apollo",
};

export function EnrichmentBadge({
  source,
  confidence,
  fetchedAt,
}: {
  source?: string | null;
  confidence?: number | null;
  fetchedAt?: string | null;
}) {
  if (!source || source === "user") return null;
  const label = SOURCE_LABEL[source] ?? source;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="ml-1.5 inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
          {confidence != null && <> · {confidence}% confidence</>}
          {fetchedAt && <> · {new Date(fetchedAt).toLocaleDateString()}</>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
