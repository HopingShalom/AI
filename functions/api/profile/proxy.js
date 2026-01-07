export async function onRequestPost(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  try {
    const session = await context.env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ?"
    )
      .bind(token)
      .first();

    if (!session) {
      return Response.json(
        { ok: false, error: "유효하지 않은 세션입니다" },
        { status: 401 }
      );
    }

    const body = await context.request.json();
    const enabledRaw = body && body.enabled;

    // enabled가 true/1/문자열 "true" 등일 때 1, 나머지는 0
    const enabled =
      enabledRaw === true ||
      enabledRaw === 1 ||
      enabledRaw === "1" ||
      enabledRaw === "true"
        ? 1
        : 0;

    await context.env.DB.prepare(
      "UPDATE users SET proxy_enabled = ? WHERE id = ?"
    )
      .bind(enabled, session.user_id)
      .run();

    return Response.json({
      ok: true,
      proxyEnabled: enabled
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
