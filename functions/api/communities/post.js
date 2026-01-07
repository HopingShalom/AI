function hasCrisisKeyword(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  const patterns = [
    '자살', '죽고 싶', '죽고싶', '삶을 끝내고 싶', '극단적인 선택',
    '자해', 'self-harm', 'self harm', 'harm myself', 'kill myself'
  ];
  return patterns.some(p => lower.includes(p));
}

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

    const me = session.user_id;

    const body = await context.request.json();
    const rawCommId =
      body && body.communityId ? String(body.communityId) : "";
    const communityId = rawCommId.trim();
    const rawContent = body && body.content ? String(body.content) : "";
    const content = rawContent.trim();

    if (!communityId) {
      return Response.json(
        { ok: false, error: "communityId가 필요합니다" },
        { status: 400 }
      );
    }

    if (!content) {
      return Response.json(
        { ok: false, error: "내용을 입력해주세요" },
        { status: 400 }
      );
    }

    // 커뮤니티 존재 여부
    const comm = await context.env.DB.prepare(
      "SELECT id, name, is_private " +
        "FROM communities WHERE id = ?"
    )
      .bind(communityId)
      .first();

    if (!comm) {
      return Response.json(
        { ok: false, error: "커뮤니티를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 멤버인지 확인
    const member = await context.env.DB.prepare(
      "SELECT role, status " +
        "FROM community_members " +
        "WHERE community_id = ? AND user_id = ? " +
        "LIMIT 1"
    )
      .bind(communityId, me)
      .first();

    const isMember =
      member &&
      (member.role === "owner" ||
        member.role === "admin" ||
        member.role === "member") &&
      member.status === "active";

    if (!isMember) {
      return Response.json(
        { ok: false, error: "멤버만 글을 작성할 수 있습니다" },
        { status: 403 }
      );
    }

    const postId = "post_" + crypto.randomUUID().slice(0, 8);

    // visibility는 일단 'public'로 통일 (커뮤니티 내부 기준)
    await context.env.DB.prepare(
      "INSERT INTO posts (id, user_id, type, content, ai_conversation_id, visibility, community_id) " +
        "VALUES (?, ?, 'community', ?, NULL, 'public', ?)"
    )
      .bind(postId, me, content, communityId)
      .run();

    return Response.json({
      ok: true,
      post: {
        id: postId,
        communityId: communityId,
        content: content
      }
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
