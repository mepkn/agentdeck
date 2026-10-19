import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { Events } from "@wailsio/runtime";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Deck, errorMessage } from "@/lib/api";

// Drafts survive switching sessions.
const drafts = new Map<string, string>();

export function Composer({
  sessionId,
  working,
  actions,
}: {
  sessionId: string;
  working: boolean;
  actions?: ReactNode;
}) {
  const [text, setText] = useState(() => drafts.get(sessionId) ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [sessionId]);

  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  // Files dropped on the composer are added as paths; the agent reads them from disk.
  useEffect(() => {
    return Events.On("files:dropped", (ev) => {
      const paths = (ev.data as string[]).map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(" ");
      setText((t) => {
        const v = t && !/\s$/.test(t) ? `${t} ${paths} ` : `${t}${paths} `;
        drafts.set(sessionId, v);
        return v;
      });
      ref.current?.focus();
    });
  }, [sessionId]);

  function update(v: string) {
    setText(v);
    drafts.set(sessionId, v);
  }

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    update("");
    try {
      await Deck.Send(sessionId, msg);
    } catch (e) {
      update(msg);
      toast.error(errorMessage(e, "Could not send."));
    }
  }

  return (
    <div
      data-file-drop-target
      className="flex items-end gap-2 rounded-xl border border-input bg-card p-2 focus-within:border-ring/60 [&.file-drop-target-active]:border-dashed [&.file-drop-target-active]:border-ring"
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder="Message the agent, or drop files here"
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-60 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      {actions}
      {working && (
        <Button
          variant="secondary"
          size="icon"
          aria-label="Interrupt (Esc)"
          title="Interrupt (Esc)"
          onClick={() => Deck.Key(sessionId, "esc").catch(() => {})}
        >
          <SquareIcon className="size-3 fill-current" />
        </Button>
      )}
      <Button size="icon" aria-label="Send" title="Send (Enter)" disabled={!text.trim()} onClick={send}>
        <ArrowUpIcon />
      </Button>
    </div>
  );
}
