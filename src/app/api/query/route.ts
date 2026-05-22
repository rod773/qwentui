import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const HF_TOKEN = process.env.HF_TOKEN;

const QWEN_MODELS = [
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-32B-Instruct",
  "Qwen/Qwen2.5-14B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "Qwen/Qwen2.5-3B-Instruct",
  "Qwen/Qwen2.5-1.5B-Instruct",
  "Qwen/Qwen2.5-0.5B-Instruct",
  "Qwen/Qwen2-72B-Instruct",
  "Qwen/Qwen2-57B-A14B-Instruct",
  "Qwen/Qwen2-7B-Instruct",
  "Qwen/Qwen2-1.5B-Instruct",
  "Qwen/Qwen2-0.5B-Instruct",
  "Qwen/QwQ-32B-Preview",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "Qwen/Qwen2.5-Coder-14B-Instruct",
  "Qwen/Qwen2.5-Coder-7B-Instruct",
  "Qwen/Qwen2.5-Math-72B-Instruct",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cmd = body.command;

    if (cmd === "list_models") {
      const family = (body.family || "").toLowerCase();
      let models: string[];
      if (family === "qwen2.5") {
        models = QWEN_MODELS.filter((m) => m.includes("Qwen2.5"));
      } else if (family === "qwen2") {
        models = QWEN_MODELS.filter((m) => /Qwen2(?!\.5)/.test(m));
      } else if (family === "qwq") {
        models = QWEN_MODELS.filter((m) => m.includes("QwQ"));
      } else {
        models = [...QWEN_MODELS];
      }
      return Response.json(models);
    }

    if (cmd === "model_info") {
      const model = body.model;
      const res = await fetch(
        `https://huggingface.co/api/models/${model}`,
        {
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
          },
        }
      );
      if (!res.ok) {
        return Response.json({
          model_id: model,
          note: "Detailed info unavailable via HF API",
        });
      }
      const info = await res.json();
      return Response.json({
        model_id: info.modelId,
        pipeline_tag: info.pipeline_tag,
        private: info.private,
        downloads: info.downloads,
        likes: info.likes,
      });
    }

    return Response.json({ error: `Unknown command: ${cmd}` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
