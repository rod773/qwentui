import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HF_TOKEN = process.env.HF_TOKEN;

export async function POST(req: NextRequest) {
  const { model, messages } = await req.json();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const hfMessages = messages.map(
          (m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })
        );

        const res = await fetch(
          `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: hfMessages,
              stream: true,
              max_tokens: 2048,
            }),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                message: `HF API error (${res.status}): ${errText}`,
              }) + "\n"
            )
          );
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error", message: "No response body" }) +
                "\n"
            )
          );
          controller.close();
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
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.enqueue(
                encoder.encode(JSON.stringify({ type: "done" }) + "\n")
              );
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({ type: "token", data: content }) + "\n"
                  )
                );
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done" }) + "\n")
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: String(err),
            }) + "\n"
          )
        );
      } finally {
        try {
          controller.close();
        } catch {
          // ignore close errors
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
