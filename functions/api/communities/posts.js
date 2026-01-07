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
  const rawId = url.searchParams.get("communityId") || "";
  const communityId = String(rawId).trim();

  if (!communityId) {
    return Response.json(
      { ok: false, error: "communityId가 필요합니다" },
      { status: 400 }
    );
  }

  try {
    // 현재 사용자
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

    // 커뮤니티 정보
    const comm = await context.env.DB.prepare(
      "SELECT id, name, description, owner_id, is_private " +
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

    // 내가 이 커뮤니티의 멤버인지 확인
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

    const isBanned = member && member.status === "banned";

    if (isBanned) {
      return Response.json(
        { ok: false, error: "이 커뮤니티에서 차단된 상태입니다" },
        { status: 403 }
      );
    }

    // 비공개 커뮤니티면 멤버만 글 목록 열람 가능
    if (comm.is_private === 1 && !isMember) {
      return Response.json(
        { ok: false, error: "비공개 커뮤니티 글은 멤버만 볼 수 있습니다" },
        { status: 403 }
      );
    }

    // 글 목록 조회 (최신 순)
    const postsRes = await context.env.DB.prepare(
      "SELECT " +
        "  p.id, " +
        "  p.user_id, " +
        "  p.content, " +
        "  p.visibility, " +
        "  p.created_at, " +
        "  p.moderation_flag, " +
        "  u.display_name, " +
        "  u.is_expert, " +
        "  u.expert_type, " +
        "  u.purpose_tag " +
        "FROM posts p " +
        "JOIN users u ON u.id = p.user_id " +
        "WHERE p.type = 'community' " +
        "  AND p.community_id = ? " +
        "ORDER BY p.created_at DESC " +
        "LIMIT 50"
    )
      .bind(communityId)
      .all();

    const rows = postsRes.results || [];

    const items = rows.map(function (row) {
      return {
        id: row.id,
        author: {
          id: row.user_id,
          displayName: row.display_name,
          isExpert: row.is_expert,
          expertType: row.expert_type,
          purposeTag: row.purpose_tag
        },
        content: row.content,
        visibility: row.visibility,
        createdAt: row.created_at,
        moderationFlag: row.moderation_flag
      };
    });

    return Response.json({
      ok: true,
      community: {
        id: comm.id,
        name: comm.name,
        description: comm.description || "",
        isPrivate: comm.is_private === 1
      },
      isMember: !!isMember,
      posts: items
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
