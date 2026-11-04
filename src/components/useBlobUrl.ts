'use client';

import { useEffect, useState } from 'react';
import { getBlob } from '@/lib/file-store';

/** Loads a blob from IndexedDB as an object URL (revoked on unmount / key change). */
export function useBlobUrl(key: string | null | undefined): string | null {
  const [state, setState] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let made: string | null = null;
    void getBlob(key).then((blob) => {
      if (cancelled || !blob) return;
      made = URL.createObjectURL(blob);
      setState({ key, url: made });
    });
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [key]);

  return key && state?.key === key ? state.url : null;
}
