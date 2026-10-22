"use client";

import { useQuery } from "@tanstack/react-query";
import { CONFIG, QUERY_KEYS } from "@/constants";
import { getStorageStatus } from "../lib/storage-persistence";

export function useStorageStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.vault.storage(),
    queryFn: getStorageStatus,
    staleTime: CONFIG.STALE_TIME_MS,
  });
}
