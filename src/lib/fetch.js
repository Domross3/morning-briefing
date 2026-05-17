export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "user-agent": options.userAgent || "morning-briefing-bot/0.1",
        accept: options.accept || "text/html,application/json,text/plain,*/*",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    accept: "application/json,*/*",
  });
  return JSON.parse(text);
}
