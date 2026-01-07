export async function onRequestPost(context) {
  // 1) 인증 토큰 확인
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  try {
    // 2) 세션에서 현재 사용자 찾기
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
    const conversationId =
      body && body.conversationId ? String(body.conversationId) : "";
    let visibility = body && body.visibility ? String(body.visibility) : "public";

    if (!conversationId) {
      return Response.json(
        { ok: false, error: "conversationId가 필요합니다" },
        { status: 400 }
      );
    }

    const allowed = ["public", "followers", "private"];
    if (!allowed.includes(visibility)) {
      visibility = "public";
    }

    // 3) 해당 대화가 현재 사용자 소유인지 확인
    const conv = await context.env.DB.prepare(
      "SELECT id, user_id, title FROM ai_conversations WHERE id = ?"
    )
      .bind(conversationId)
      .first();

    if (!conv) {
      return Response.json(
        { ok: false, error: "대화를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (conv.user_id !== session.user_id) {
      return Response.json(
        { ok: false, error: "자신의 대화만 공유할 수 있습니다" },
        { status: 403 }
      );
    }

    // 4) 같은 대화를 같은 타입으로 이미 공유한 적이 있는지 확인 (중복 방지)
    const existing = await context.env.DB.prepare(
      "SELECT id FROM posts WHERE type = 'ai_share' AND ai_conversation_id = ? AND user_id = ? LIMIT 1"
    )
      .bind(conversationId, session.user_id)
      .first();

    if (existing) {
      // 이미 존재하면 그 게시물의 공개범위만 업데이트할 수도 있음
      await context.env.DB.prepare(
        "UPDATE posts SET visibility = ? WHERE id = ?"
      )
        .bind(visibility, existing.id)
        .run();

      return Response.json({
        ok: true,
        postId: existing.id,
        updated: true,
        message: "이미 공유된 대화입니다. 공개범위만 업데이트했습니다."
      });
    }

    // 5) 새 posts 레코드 생성
    const postId = "post_" + crypto.randomUUID().slice(0, 8);

    await context.env.DB.prepare(
      "INSERT INTO posts (id, user_id, type, content, ai_conversation_id, visibility) " +
        "VALUES (?, ?, 'ai_share', ?, ?, ?)"
    )
      .bind(
        postId,
        session.user_id,
        null, // content는 지금은 사용 안 함(설명 텍스트 추가 시 활용)
        conversationId,
        visibility
      )
      .run();

    return Response.json({
      ok: true,
      postId: postId,
      updated: false,
      message: "My AI 대화를 피드에 공유했습니다."
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
