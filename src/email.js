export async function sendEmail({ apiKey, from, to, subject, html }) {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required for non-dry runs.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${body}`);
  }

  return JSON.parse(body);
}
