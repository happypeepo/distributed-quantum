"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CONFIG, UI } from "@/constants";
import { useStorageStatus } from "../hooks/use-storage-status";
import { evaluateStorageWarning } from "../lib/storage-persistence";

interface StorageWarningBannerProps {
  hasItems: boolean;
}

export function StorageWarningBanner({ hasItems }: StorageWarningBannerProps) {
  const { data: status } = useStorageStatus();
  if (!status) return null;

  const warning = evaluateStorageWarning(status, {
    hasItems,
    warnRatio: CONFIG.VAULT_STORAGE_WARN_RATIO,
  });
  if (!warning) return null;

  const copy = UI.VAULT_STORAGE;
  const usagePercent = Math.round((status.usedRatio ?? 0) * 100);

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>
        {warning === "usage-high" ? copy.USAGE_HIGH_TITLE : copy.NOT_PERSISTED_TITLE}
      </AlertTitle>
      <AlertDescription>
        <p>
          {warning === "usage-high"
            ? `${copy.USAGE_HIGH_BODY} ${usagePercent}% ${copy.USAGE_LABEL}`
            : copy.NOT_PERSISTED_BODY}
        </p>
        <p>{copy.ADVICE}</p>
      </AlertDescription>
    </Alert>
  );
}
