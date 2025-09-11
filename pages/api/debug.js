import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
export const config = { runtime: "nodejs" };
export default async function handler(req, res) {
  try {
    const promptPath = path.join(process.cwd(), "data", "prompt.txt");
    const p = await fs.readFile(promptPath, "utf8");
    const promptHash = crypto.createHash("sha256").update(p, "utf8").digest("hex");
    res.status(200).json({
      promptHash,
      model: process.env.MISTRAL_MODEL || "mistral-large-latest",
      temperature: 0.0
    });
  } catch (e) {
    res.status(500).json({ error: "debug-failed", message: String(e) });
  }
}
