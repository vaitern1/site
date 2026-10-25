/*
  Приём заявок для сайтов без PHP (GitHub Pages, Netlify, Vercel, Cloudflare Pages и т. д.).
  Это Cloudflare Worker: бесплатный, токен бота хранится в секретах Cloudflare и не попадает на сайт и в GitHub.

  Настройка (в браузере, без командной строки):
   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → Deploy.
   2. Edit code → удалите всё и вставьте этот файл целиком → Deploy.
   3. Settings → Variables and Secrets → Add:
        TELEGRAM_BOT_TOKEN = токен бота            (тип Secret)
        TELEGRAM_CHAT_ID   = -1003852428895         (тип Text)
        ALLOWED_ORIGINS    = https://data-verification.com,https://www.data-verification.com   (тип Text)
   4. Скопируйте адрес воркера (https://ИМЯ.ВАШ-АККАУНТ.workers.dev) и впишите его в config.js:
        LEADS: { mode: "webhook", webhook: { url: "https://ИМЯ.ВАШ-АККАУНТ.workers.dev", headers: {} } }
*/
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.length === 0 || allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin && origin ? origin : (allowed[0] || "*"),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Vary": "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { ok: false, error: "method not allowed" });
    if (!okOrigin) return reply(403, { ok: false, error: "forbidden" });

    let d;
    try { d = await request.json(); } catch (e) { return reply(400, { ok: false, error: "bad request" }); }
    if (d.website) return reply(200, { ok: true });                                   // honeypot for bots
    const clean = v => String(v ?? "").replace(/<[^>]*>/g, "").slice(0, 3000).trim();
    const f = Object.fromEntries(["name", "contact", "company", "message", "service", "estimate", "details", "lead_id",
      "utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid", "yclid", "referrer", "landing_page", "consent"]
      .map(k => [k, clean(d[k])]));
    if (!f.name || !f.contact) return reply(422, { ok: false, error: "Please fill in your name and contact" });
    if (f.consent !== "yes" && f.consent !== "да") return reply(422, { ok: false, error: "Privacy Policy consent is required" });

    const text = [
      "New request from the DataQA website", "",
      `Name: ${f.name}`, `Contact: ${f.contact}`, `Company/website: ${f.company || "—"}`,
      `Service: ${f.service}${f.estimate ? ` (${f.estimate})` : ""}`, `Details: ${f.details || "—"}`,
      `Message: ${f.message || "—"}`, "",
      `Source: ${f.utm_source || "—"} / ${f.utm_medium || "—"} / ${f.utm_campaign || "—"}`,
      `Click ID: ${f.gclid || f.fbclid || f.yclid || "—"}`, `Referrer: ${f.referrer || "—"}`,
      `Landing page: ${f.landing_page || "—"}`, `Lead ID: ${f.lead_id}`,
    ].join("\n");

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(500, { ok: false, error: "Telegram is not configured" });
    const tg = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!tg.ok) {
      const err = await tg.text();
      return reply(502, { ok: false, error: "Telegram error: " + err.slice(0, 200) });
    }
    return reply(200, { ok: true, lead_id: f.lead_id });
  },
};
