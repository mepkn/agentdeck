import { toast } from "sonner";
import { Deck, errorMessage } from "@/lib/api";

// Wakes a session, asking first if it looks open in another terminal.
export async function wake(id: string) {
  try {
    await Deck.Wake(id);
  } catch (e) {
    const msg = errorMessage(e, "Could not wake the session.");
    if (!msg.includes("in use somewhere else")) {
      toast.error(msg);
      return;
    }
    toast("This session is in use somewhere else", {
      description: "Its log changed in the last two minutes. Waking it here too runs two agents on one conversation.",
      action: {
        label: "Wake anyway",
        onClick: () => Deck.WakeAnyway(id).catch((e) => toast.error(errorMessage(e, "Could not wake the session."))),
      },
    });
  }
}
