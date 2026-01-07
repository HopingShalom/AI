export async function onRequestGet(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  const url = new URL(context.request.url);
  const conversationId = url.searchParams.get("conversationId");

  if (!conversationId) {
    return Response.json(
      { ok: false, error: "conversationId가 필요합니다" },
      { status: 400 }
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

    const me = session.user_id;

    // 이 대화방에 내가 속해 있는지 확인
    const conv = await context.env.DB.prepare(
      "SELECT id, user_a_id, user_b_id " +
        "FROM dm_conversations " +
        "WHERE id = ?"
    )
      .bind(conversationId)
      .first();

    if (!conv) {
      return Response.json(
        { ok: false, error: "대화를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (conv.user_a_id !== me && conv.user_b_id !== me) {
      return Response.json(
        { ok: false, error: "이 대화에 접근할 권한이 없습니다" },
        { status: 403 }
      );
    }

    const msgsRes = await context.env.DB.prepare(
      "SELECT id, sender_id, sender_type, content, created_at " +
        "FROM dm_messages " +
        "WHERE conversation_id = ? " +
        "ORDER BY created_at ASC"
    )
      .bind(conversationId)
      .all();

    return Response.json({ ok: true, messages: msgsRes.results || [] });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
