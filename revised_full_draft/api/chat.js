export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { system, userMsg } = body;  // ← read what the frontend actually sends

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",  // ← updated model
        max_tokens: 800,
        system,          // ← forward the system prompt with RAG context
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
    console.error("Anthropic error:", JSON.stringify(data)); // visible in Vercel logs
    return res.status(response.status).json(data);
    }
  
}