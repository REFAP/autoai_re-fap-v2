export async function sendChatMessage(message: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ message: message.trim() }),
  });
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}
