import fs from "fs/promises";
import crypto from "crypto";
export default async function handler(req,res){
  const p = await fs.readFile(process.cwd()+"/data/prompt.txt","utf8");
  const promptHash = crypto.createHash("sha256").update(p,"utf8").digest("hex");
  res.status(200).json({ promptHash, model: process.env.MISTRAL_MODEL || "mistral-large-latest", temperature: 0.0 });
}
