"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct";

const HELP_TEXT = `Available commands:
  /help                  Show this help
  /models                List available models
  /model <name>          Select a model by name
  /info <model>          Show model information
  /clear                 Clear the terminal
  /stop                  Stop the current response

Tip: Press Esc to abort streaming at any time.`;

export default function Terminal() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [infoText, setInfoText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("qwentui-model");
    if (saved) setModel(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("qwentui-model", model);
  }, [model]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, infoText]);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && streamingRef.current) {
        stopStreamingRef.current?.();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setThinking(false);
  }, []);

  const stopStreamingRef = useRef(stopStreaming);
  stopStreamingRef.current = stopStreaming;

  const handleStop = useCallback(() => {
    stopStreaming();
    appendAssistant("\n[stopped]");
  }, [stopStreaming]);

  function appendAssistant(chunk: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          content: last.content + chunk,
        };
        return updated;
      }
      return [...prev, { role: "assistant", content: chunk }];
    });
  }

  function setAssistantContent(content: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, content };
        return updated;
      }
      return [...prev, { role: "assistant", content }];
    });
  }

  async function fetchModels() {
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "list_models" }),
      });
      if (!res.ok) {
        const errBody = await res.json() as Record<string, string>;
        appendLine(`Error: ${errBody.error || "Failed to fetch models"}`);
        return;
      }
      const data = await res.json();
      let list: string[] = [];
      if (Array.isArray(data)) {
        list = data.map((m: unknown) => (typeof m === "string" ? m : String((m as Record<string, string>).name || (m as Record<string, string>).model || m)));
      }
      setModels(list);
      const output = list.map((m, i) => `${i + 1}. ${m}`).join("\n");
      appendLine(`Available models:\n${output}\n\nEnter a number to select a model.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLine(`Error: ${msg}`);
    }
  }

  async function fetchModelInfo(modelName: string) {
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "model_info", model: modelName }),
      });
      if (!res.ok) {
        const errBody = await res.json() as Record<string, string>;
        appendLine(`Error: ${errBody.error || "Failed to fetch model info"}`);
        return;
      }
      const data = await res.json();
      const info = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
      appendLine(`Model info for ${modelName}:\n${info}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      appendLine(`Error: ${msg}`);
    }
  }

  function appendLine(text: string) {
    setMessages((prev) => [...prev, { role: "assistant", content: text }]);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setInput("");
    setInfoText(null);

    if (trimmed.startsWith("/")) {
      await handleCommand(trimmed);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setThinking(true);
    setStreaming(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const conversation = [...messages, { role: "user" as const, content: trimmed }];
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: conversation }),
        signal: abort.signal,
      });

      if (!res.ok) {
        setAssistantContent(`Error: Server returned ${res.status}`);
        setStreaming(false);
        setThinking(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setAssistantContent("Error: No response body");
        setStreaming(false);
        setThinking(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "token") {
              appendAssistant(parsed.data);
            } else if (parsed.type === "done") {
              setStreaming(false);
              setThinking(false);
            } else if (parsed.type === "error") {
              setAssistantContent(`Error: ${parsed.message}`);
              setStreaming(false);
              setThinking(false);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // aborted, ignore
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setAssistantContent(`Error: ${msg}`);
      }
    } finally {
      setStreaming(false);
      setThinking(false);
      abortRef.current = null;
    }
  }

  async function handleCommand(cmd: string) {
    const parts = cmd.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "help":
        appendLine(HELP_TEXT);
        break;

      case "models":
        await fetchModels();
        break;

      case "model":
        if (args.length === 0) {
          appendLine(`Current model: ${model}`);
        } else {
          const newModel = args.join(" ");
          setModel(newModel);
          appendLine(`Switched to model: ${newModel}`);
        }
        break;

      case "info":
        if (args.length === 0) {
          appendLine(`Usage: /info <model_name>`);
        } else {
          await fetchModelInfo(args.join(" "));
        }
        break;

      case "clear":
        setMessages([]);
        setInfoText(null);
        break;

      case "stop":
        if (streaming) {
          handleStop();
        } else {
          appendLine("No active response to stop.");
        }
        break;

      default:
        appendLine(`Unknown command: ${cmd}\nType /help for available commands.`);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;

    if (models.length > 0 && val.match(/^\d+$/) && !streaming) {
      const num = parseInt(val, 10);
      if (num >= 1 && num <= models.length) {
        const selected = models[num - 1];
        setModel(selected);
        setModels([]);
        setInput("");
        appendLine(`Selected model: ${selected}`);
        return;
      }
    }

    setInput(val);
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a] text-[#00ff41] font-mono">
      <header className="flex items-center justify-between px-4 py-2 border-b border-[#008f28] bg-[#0d0d0d] shrink-0">
        <span className="text-[#00ff41] font-bold tracking-wider">
          qwentui
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[#008f28] text-sm">
            model: <span className="text-[#00ff41]">{model}</span>
          </span>
          {thinking && (
            <span className="text-[#008f28] text-sm animate-pulse">
              thinking...
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-[#008f28]">
            Welcome to qwentui. Type /help for available commands.
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="whitespace-pre-wrap break-words">
            {msg.role === "user" ? (
              <span>
                <span className="text-[#00ff41]">$ </span>
                <span className="text-[#66ff99]">{msg.content}</span>
              </span>
            ) : msg.content ? (
              <span className="text-[#00ff41]">{msg.content}</span>
            ) : thinking ? (
              <span className="text-[#008f28] animate-pulse">▊</span>
            ) : null}
          </div>
        ))}

        {infoText && (
          <div className="text-[#008f28] text-sm">{infoText}</div>
        )}

        <div ref={chatEndRef} />
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-0 px-4 py-3 border-t border-[#008f28] bg-[#0d0d0d] shrink-0"
      >
        <span className="text-[#00ff41] mr-2">$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          disabled={streaming}
          placeholder={streaming ? "(streaming...)" : "type a message or /command"}
          className="flex-1 bg-transparent border-none outline-none text-[#00ff41] placeholder-[#005a1a] font-mono text-base"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
