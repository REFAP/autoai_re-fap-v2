import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setLoading(true);
    setOut(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setOut(data);
    } catch (e) {
      setOut({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>AutoAI par Re-FAP</h1>

      <div className="card">
        <div className="small">AutoAI :</div>
        <p>Bonjour 👋 ! Je suis <b>AutoAI</b> (Re-FAP). Je t’aide à comprendre un voyant, un souci de <b>FAP/DPF</b> ou autre panne et je t’oriente vers la bonne solution. Pose ta question 😊</p>
      </div>

      <div className="card row">
        <input type="text" placeholder="Écris ta question ici…" value={input}
               onChange={e=>setInput(e.target.value)}
               onKeyDown={e=>{ if(e.key==='Enter') send(); }} />
        <button onClick={send} disabled={loading}>{loading ? "…" : "Envoyer"}</button>
      </div>

      {out && (
        <div className="card">
          <div className="small">Réponse JSON (debug)</div>
          <pre>{JSON.stringify(out, null, 2)}</pre>
        </div>
      )}

      <div className="card small">
        ℹ️ AutoAI peut faire des erreurs, envisage de vérifier les informations importantes.
      </div>
    </div>
  );
}
