import { useEffect, useState } from "react";
import { resolveCatalogImageUri } from "../lib/catalog-image-cache";

type State = {
  uri: string | null;
  loading: boolean;
  failed: boolean;
};

/**
 * Resolves remote catalog images to a local file URI after first download.
 */
export function useCachedRemoteImage(remoteUrl: string | null | undefined): State {
  const [state, setState] = useState<State>({
    uri: null,
    loading: Boolean(remoteUrl?.trim()),
    failed: false,
  });

  useEffect(() => {
    const trimmed = remoteUrl?.trim() ?? "";
    if (!trimmed) {
      setState({ uri: null, loading: false, failed: false });
      return;
    }

    let cancelled = false;
    setState({ uri: null, loading: true, failed: false });

    resolveCatalogImageUri(trimmed)
      .then((localUri) => {
        if (!cancelled) {
          setState({ uri: localUri, loading: false, failed: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ uri: trimmed, loading: false, failed: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);

  return state;
}
