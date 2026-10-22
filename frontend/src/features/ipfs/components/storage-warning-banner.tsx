"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CONFIG, UI } from "@/constants";
import { useStorageStatus } from "../hooks/use-storage-status";
import {
  dismissPersistenceWarning,
  evaluateStorageWarning,
  isPersistenceWarningDismissed,
} from "../lib/storage-persistence";

interface StorageWarningBannerProps {
  hasItems: boolean;
}

export function StorageWarningBanner({ hasItems }: StorageWarningBannerProps) {
  const { data: status } = useStorageStatus();
  const [dismissed, setDismissed] = useState(isPersistenceWarningDismissed);
  if (!status) return null;

  const warning = evaluateStorageWarning(status, {
    hasItems,
    warnRatio: CONFIG.VAULT_STORAGE_WARN_RATIO,
    persistenceWarningDismissed: dismissed,
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
      {warning === "not-persisted" && (
        <AlertAction>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={copy.DISMISS}
            onClick={() => {
              dismissPersistenceWarning();
              setDismissed(true);
            }}
          >
            <X />
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
