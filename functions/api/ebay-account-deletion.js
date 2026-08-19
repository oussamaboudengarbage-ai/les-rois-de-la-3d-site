const ENDPOINT = "https://lesroisdela3d.dpdns.org/api/ebay-account-deletion";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet(context) {
  const token = context.env.EBAY_VERIFICATION_TOKEN;
  if (!token) {
    return json({ error: "EBAY_VERIFICATION_TOKEN missing" }, 500);
  }

  const url = new URL(context.request.url);
  const challengeCode = url.searchParams.get("challenge_code");

  if (!challengeCode) {
    return json({ ok: true, endpoint: "ebay-account-deletion" });
  }

  const challengeResponse = await sha256Hex(
    challengeCode + token + ENDPOINT
  );

  return json({ challengeResponse });
}

export async function onRequestPost(context) {
  try {
    await context.request.text();
  } catch (_) {}

  return new Response(null, { status: 204 });
}
