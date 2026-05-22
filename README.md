# qwentui

Terminal-style chat interface for Qwen models via the Hugging Face Inference API.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment file and add your Hugging Face token:

```bash
cp .env.example .env.local
```

Get your token at https://huggingface.co/settings/tokens.

3. Start the dev server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Usage

The interface is a terminal emulator. Available commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/models` | List available Qwen models |
| `/model <name>` | Select a model by name |
| `/info <model>` | Show model information |
| `/clear` | Clear the terminal |
| `/stop` | Stop the current response |

Press `Esc` to abort streaming at any time.

Type a number while the model list is displayed to select a model by index.

## Architecture

- **`src/app/page.tsx`** — Terminal UI (client component)
- **`src/app/api/query/route.ts`** — API route for model listing and info (calls HF API directly)
- **`src/app/api/chat/route.ts`** — API route for streaming chat (calls HF Inference API, converts SSE to NDJSON stream)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HF_TOKEN` | Yes | Hugging Face API token |
