import { spawn } from "child_process";
import path from "path";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { model, messages } = await req.json();
  const pythonScript = path.join(process.cwd(), "qwen_bridge.py");

  const encoder = new TextEncoder();

  let controller: ReadableStreamDefaultController | null = null;
  let proc: ReturnType<typeof spawn> | null = null;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      proc = spawn(pythonCmd, [pythonScript], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let streamEnded = false;

      function endStream() {
        if (streamEnded) return;
        streamEnded = true;
        try {
          controller?.close();
        } catch {}
      }

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        const lines = text.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            JSON.parse(line);
            controller?.enqueue(encoder.encode(line + "\n"));
          } catch {}
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        console.error("python stderr:", data.toString());
      });

      proc.on("close", (code) => {
        if (code !== 0 && !streamEnded) {
          console.error("python exited with code:", code);
        }
        endStream();
      });

      proc.on("error", (err) => {
        console.error("python spawn error:", err);
        if (!streamEnded) {
          try {
            controller?.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "error",
                  message: `Failed to start Python: ${err.message}`,
                }) + "\n"
              )
            );
          } catch {}
        }
        endStream();
      });

      const reqMsg =
        JSON.stringify({ command: "stream_chat", model, messages }) + "\n";
      proc.stdin?.write(reqMsg);
      proc.stdin?.end();
    },
    cancel() {
      if (proc && !proc.killed) {
        proc.kill("SIGTERM");
      }
      try {
        controller?.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
