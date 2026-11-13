const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const esc = s => s.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Only these values are accepted from the "What do you need help with?" dropdown
const TOPICS = new Set([
  "New monitoring or observability setup",
  "Improve or tune existing monitoring",
  "Security monitoring or SIEM",
  "IT equipment quote",
  "Not sure yet",
]);

async function turnstilePassed(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const outcome = await res.json();
    return outcome.success === true;
  } catch {
    return false;
  }
}

async function handleContact(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false }, 400); }

  if (form.get("_gotcha")) return json({ ok: true }); // honeypot

  // Bot check. It is enforced as soon as TURNSTILE_SECRET_KEY exists on the Worker.
  if (env.TURNSTILE_SECRET_KEY) {
    const token = (form.get("cf-turnstile-response") || "").toString();
    const ip = request.headers.get("CF-Connecting-IP");
    if (!(await turnstilePassed(token, env.TURNSTILE_SECRET_KEY, ip))) {
      return json({ ok: false, error: "captcha" }, 400);
    }
  }

  const name = (form.get("name") || "").toString().trim().slice(0, 100);
  const email = (form.get("email") || "").toString().trim().slice(0, 200);
  const message = (form.get("message") || "").toString().trim().slice(0, 5000);
  const topicRaw = (form.get("topic") || "").toString().trim();
  const topic = TOPICS.has(topicRaw) ? topicRaw : "";

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false }, 400);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TechEssentials Website <website@send.techessentials.co.za>",
      to: ["support@techessentials.co.za"],
      reply_to: email,
      subject: `New website enquiry from ${name.replace(/[\r\n]/g, " ")}`,
      html: `<p><strong>Name:</strong> ${esc(name)}</p>
             <p><strong>Email:</strong> ${esc(email)}</p>` +
            (topic ? `<p><strong>Interested in:</strong> ${esc(topic)}</p>` : "") +
            `<p><strong>Message:</strong></p>
             <p>${esc(message).replace(/\n/g, "<br>")}</p>`,
    }),
  });

  return res.ok ? json({ ok: true }) : json({ ok: false }, 502);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") {
      return request.method === "POST"
        ? handleContact(request, env)
        : new Response("Method not allowed", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
