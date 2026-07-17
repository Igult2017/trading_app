import { useEffect, useState } from "react";

export type SetToast = (message: string) => void;

/** A single transient message, self-clearing after 3.2s. Re-setting it restarts the timer. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  return { toast, setToast };
}
