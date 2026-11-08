const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const esc = s => s.replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function handleContact(request, env) {
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false }, 400); }

  if (form.get("_gotcha")) return json({ ok: true }); // honeypot

  const name = (form.get("name") || "").toString().trim().slice(0, 100);
  const email = (form.get("email") || "").toString().trim().slice(0, 200);
  const message = (form.get("message") || "").toString().trim().slice(0, 5000);

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
             <p><strong>Email:</strong> ${esc(email)}</p>
             <p><strong>Message:</strong></p>
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
