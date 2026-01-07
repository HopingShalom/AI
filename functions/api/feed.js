export async function onRequestGet(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  let currentUserId = null;
  let followingIds = [];

  // 1) 현재 사용자/팔로잉 목록
  if (token) {
    const session = await context.env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ?"
    )
      .bind(token)
      .first();

    if (session) {
      currentUserId = session.user_id;

      const following = await context.env.DB.prepare(
        "SELECT following_id FROM follows WHERE follower_id = ?"
      )
        .bind(currentUserId)
        .all();

      followingIds = (following.results || []).map(function (f) {
        return f.following_id;
      });
    }
  }

  try {
    // 2) posts 기준으로 ai_share 가져오기
    const postsRes = await context.env.DB.prepare(
      "SELECT " +
        "  p.id AS post_id," +
        "  p.ai_conversation_id," +
        "  p.visibility AS post_visibility," +
        "  p.created_at AS post_created_at," +
        "  c.title AS conv_title," +
        "  u.id AS user_id," +
        "  u.display_name," +
        "  u.purpose_tag," +
        "  u.is_expert," +
        "  u.expert_type " +
        "FROM posts p " +
        "JOIN ai_conversations c ON p.ai_conversation_id = c.id " +
        "JOIN users u ON p.user_id = u.id " +
        "WHERE p.type = 'ai_share' " +
        "  AND p.visibility IN ('public','followers') " +
        "  AND p.user_id != ? " +
        "ORDER BY p.created_at DESC " +
        "LIMIT 40"
    )
      .bind(currentUserId || "")
      .all();

    const rows = postsRes.results || [];

    // 3) visibility에 따라 필터링
    const visibleRows = rows.filter(function (row) {
      if (row.post_visibility === "public") return true;

      if (row.post_visibility === "followers") {
        if (!currentUserId) return false;
        return followingIds.includes(row.user_id);
      }

      return false;
    });

    if (!visibleRows.length) {
      return Response.json({
        ok: true,
        feed: []
      });
    }

    // 4) 각 게시물마다 첫 user 메시지 프리뷰 가져오기
    const feedItems = await Promise.all(
      visibleRows.map(async function (row) {
        const previewRow = await context.env.DB.prepare(
          "SELECT content " +
            "FROM ai_messages " +
            "WHERE conversation_id = ? AND role = 'user' " +
            "ORDER BY created_at ASC " +
            "LIMIT 1"
        )
          .bind(row.ai_conversation_id)
          .first();

        const previewText = previewRow && previewRow.content
          ? String(previewRow.content).slice(0, 100)
          : "";

        return {
          type: "ai_conversation",
          id: row.ai_conversation_id, // 프론트에서 data-conv-id로 사용
          title: row.conv_title,
          preview: previewText,
          visibility: row.post_visibility,
          createdAt: row.post_created_at,
          user: {
            id: row.user_id,
            displayName: row.display_name,
            purposeTag: row.purpose_tag,
            isExpert: row.is_expert,
            expertType: row.expert_type
          }
        };
      })
    );

    // 5) 시간순 정렬 후 최대 20개만
    feedItems.sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return Response.json({
      ok: true,
      feed: feedItems.slice(0, 20)
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
