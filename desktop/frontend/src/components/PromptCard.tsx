import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Deck, errorMessage, type Prompt } from "@/lib/api";

// A menu the agent is waiting on, read from its terminal screen.
export function PromptCard({ sessionId, prompt }: { sessionId: string; prompt: Prompt }) {
  async function answer(n: number) {
    try {
      await Deck.Answer(sessionId, n);
    } catch (e) {
      toast.error(errorMessage(e, "Could not answer."));
    }
  }

  return (
    <div className="rounded-xl border border-status-waiting/40 bg-card p-4 shadow-lg">
      {prompt.context && prompt.context.length > 0 && (
        <pre className="selectable mb-3 max-h-40 overflow-auto rounded-md bg-code p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {prompt.context.join("\n")}
        </pre>
      )}
      <p className="mb-3 text-sm font-medium">{prompt.question}</p>
      <div className="flex flex-col gap-1.5">
        {(prompt.options ?? []).map((o) => (
          <Button
            key={o.number}
            variant={o.number === 1 ? "default" : "outline"}
            className="h-auto justify-start py-2 text-left whitespace-normal"
            onClick={() => answer(o.number)}
          >
            <span className="mr-1 font-mono text-xs opacity-60">{o.number}</span>
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
