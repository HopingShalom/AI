export async function onRequestGet(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  try {
    // 세션에서 현재 사용자 찾기
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

    // 내가 속한 DM 대화방 목록
    const convRes = await context.env.DB.prepare(
      "SELECT id, user_a_id, user_b_id, created_at, updated_at " +
        "FROM dm_conversations " +
        "WHERE user_a_id = ? OR user_b_id = ? " +
        "ORDER BY updated_at DESC " +
        "LIMIT 50"
    )
      .bind(me, me)
      .all();

    const conversations = convRes.results || [];
    if (!conversations.length) {
      return Response.json({ ok: true, conversations: [] });
    }

    // 상대 user_id 목록 수집
    const otherIds = [];
    for (let i = 0; i < conversations.length; i++) {
      const c = conversations[i];
      const otherId = c.user_a_id === me ? c.user_b_id : c.user_a_id;
      if (!otherIds.includes(otherId)) otherIds.push(otherId);
    }

    // 상대 프로필 정보
    let usersById = {};
    if (otherIds.length > 0) {
      const placeholders = otherIds.map(() => "?").join(",");
      const usersRes = await context.env.DB.prepare(
        "SELECT id, display_name, purpose_tag, is_expert, expert_type " +
          "FROM users WHERE id IN (" +
          placeholders +
          ")"
      )
        .bind(...otherIds)
        .all();

      const rows = usersRes.results || [];
      for (let i = 0; i < rows.length; i++) {
        usersById[rows[i].id] = rows[i];
      }
    }

    // 각 대화방의 마지막 메시지
    const dmList = [];

    for (let i = 0; i < conversations.length; i++) {
      const c = conversations[i];
      const otherId = c.user_a_id === me ? c.user_b_id : c.user_a_id;

      const lastMsgRes = await context.env.DB.prepare(
        "SELECT sender_id, sender_type, content, created_at " +
          "FROM dm_messages " +
          "WHERE conversation_id = ? " +
          "ORDER BY created_at DESC " +
          "LIMIT 1"
      )
        .bind(c.id)
        .first();

      const other = usersById[otherId] || {
        id: otherId,
        display_name: "알 수 없음",
        purpose_tag: "",
        is_expert: 0,
        expert_type: null
      };

      dmList.push({
        id: c.id,
        otherUser: {
          id: other.id,
          displayName: other.display_name,
          purposeTag: other.purpose_tag,
          isExpert: other.is_expert,
          expertType: other.expert_type
        },
        lastMessage: lastMsgRes
          ? {
              senderId: lastMsgRes.sender_id,
              senderType: lastMsgRes.sender_type,
              content: lastMsgRes.content,
              createdAt: lastMsgRes.created_at
            }
          : null,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      });
    }

    return Response.json({ ok: true, conversations: dmList });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
