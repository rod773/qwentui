#!/usr/bin/env python3
import sys
import json
import signal
import os
import re

running = True

def handle_signal(signum, frame):
    global running
    running = False

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

def send(msg):
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()

QWEN_MODELS = [
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
]

def main():
    try:
        from huggingface_hub import InferenceClient
    except ImportError:
        send({"type": "error", "message": "huggingface_hub not installed. Run: pip install huggingface_hub"})
        sys.exit(1)

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    client = InferenceClient(token=token)

    for line in sys.stdin:
        if not running:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            send({"type": "error", "message": f"Invalid JSON: {e}"})
            continue

        cmd = req.get("command")
        try:
            if cmd == "list_families":
                send({"type": "result", "data": ["qwen", "qwen2.5", "qwen2", "qwq"]})

            elif cmd == "list_models":
                family = req.get("family", "").lower()
                if family == "qwen2.5":
                    models = [m for m in QWEN_MODELS if "Qwen2.5" in m]
                elif family == "qwen2":
                    models = [m for m in QWEN_MODELS if re.search(r"Qwen2(?!\.5)", m)]
                elif family == "qwq":
                    models = [m for m in QWEN_MODELS if "QwQ" in m]
                elif family == "qwen":
                    models = list(QWEN_MODELS)
                else:
                    models = list(QWEN_MODELS)
                send({"type": "result", "data": models})

            elif cmd == "model_info":
                model = req.get("model")
                try:
                    info = client.get_model_info(model)
                    send({"type": "result", "data": {
                        "model_id": info.modelId,
                        "pipeline_tag": info.pipeline_tag,
                        "private": info.private,
                        "downloads": info.downloads,
                        "likes": info.likes,
                    }})
                except Exception:
                    send({"type": "result", "data": {"model_id": model, "note": "Detailed info unavailable via HF API"}})

            elif cmd == "chat":
                model = req.get("model")
                messages = req.get("messages", [])
                hf_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
                response = client.chat_completion(model=model, messages=hf_messages)
                content = response.choices[0].message.content if response.choices else ""
                send({"type": "result", "data": content})

            elif cmd == "stream_chat":
                model = req.get("model")
                messages = req.get("messages", [])
                hf_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
                stream = client.chat_completion(model=model, messages=hf_messages, stream=True)
                for chunk in stream:
                    if not running:
                        break
                    if chunk.choices and chunk.choices[0].delta.content:
                        send({"type": "token", "data": chunk.choices[0].delta.content})
                send({"type": "done"})

            else:
                send({"type": "error", "message": f"Unknown command: {cmd}"})

        except Exception as e:
            send({"type": "error", "message": str(e)})

    sys.exit(0)

if __name__ == "__main__":
    main()
