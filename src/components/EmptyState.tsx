import { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
      {icon && <div className="mb-3 text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 max-w-xs text-xs text-muted-foreground text-balance">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
