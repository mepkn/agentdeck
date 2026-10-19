import { useState } from "react";
import { Loader2Icon, SmartphoneIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Deck, errorMessage, type RemoteStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: RemoteStatus | null;
};

/** Pair a phone by QR code, and see or remove paired phones. */
export function PhoneDialog({ open, onOpenChange, status }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const phones = status?.phones ?? [];
  // Pairing ends when it succeeds, is cancelled, or the dialog closes.
  const qr = status?.pairing ? code : null;

  function change(next: boolean) {
    if (!next && qr) Deck.StopPairing().catch(() => {});
    if (!next) setCode(null);
    onOpenChange(next);
  }

  async function pair() {
    try {
      setCode(await Deck.PairPhone());
    } catch (e) {
      toast.error(errorMessage(e, "Could not start pairing."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Phone</DialogTitle>
          <DialogDescription>
            Follow and answer your agents from the agentdeck Android app. Messages are end-to-end encrypted; the relay
            can't read them.
          </DialogDescription>
        </DialogHeader>

        {qr ? (
          <div className="flex flex-col items-center gap-3">
            <img src={qr} alt="Pairing QR code" className="size-56 rounded-lg bg-white p-2" />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {status?.connected ? (
                "Scan with the agentdeck app. The code works once, for 5 minutes."
              ) : (
                <>
                  <Loader2Icon className="size-3 animate-spin" /> Connecting to the relay…
                </>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => change(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {phones.length > 0 && (
              <ul className="flex flex-col gap-1">
                {phones.map((p) => (
                  <li
                    key={p.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <SmartphoneIcon className="size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className={cn("text-xs", p.online ? "text-emerald-500" : "text-muted-foreground")}>
                      {p.online ? "online" : "offline"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${p.name}`}
                      title="Remove"
                      className="invisible group-hover:visible"
                      onClick={() => Deck.RemovePhone(p.id).catch((e) => toast.error(errorMessage(e)))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {phones.length > 0 && !status?.connected && (
              <p className="text-xs text-muted-foreground">Not connected to the relay ({status?.relay}).</p>
            )}
            <Button onClick={pair}>{phones.length ? "Pair another phone" : "Pair a phone"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
