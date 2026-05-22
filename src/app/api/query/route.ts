import { spawn } from "child_process";
import path from "path";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const pythonScript = path.join(process.cwd(), "qwen_bridge.py");

  const result = await new Promise<string>((resolve, reject) => {
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(pythonCmd, [pythonScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", reject);

    const reqMsg = JSON.stringify(body) + "\n";
    proc.stdin?.write(reqMsg);
    proc.stdin?.end();
  });

  const lines = result.trim().split("\n");
  const responses = lines.map((l) => JSON.parse(l));

  const lastResponse = responses[responses.length - 1];
  const firstResponse = responses[0];

  if (lastResponse?.type === "error") {
    return Response.json({ error: lastResponse.message }, { status: 500 });
  }

  if (firstResponse?.type === "result") {
    return Response.json(firstResponse.data);
  }

  if (firstResponse?.type === "error") {
    return Response.json({ error: firstResponse.message }, { status: 500 });
  }

  return Response.json(firstResponse);
}
