import { useEffect, useState } from "react";
import { Events } from "@wailsio/runtime";
import { Deck, type RemoteStatus } from "@/lib/api";

/** The phone link: relay connection, pairing, and paired phones. */
export function useRemoteStatus(): RemoteStatus | null {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  useEffect(() => {
    Deck.RemoteStatus()
      .then(setStatus)
      .catch(() => {});
    return Events.On("remote:changed", (ev) => setStatus(ev.data as RemoteStatus));
  }, []);
  return status;
}
