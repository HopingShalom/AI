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
    // 현재 사용자 확인
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

    // 모든 커뮤니티 + 내가 해당 커뮤니티에서 어떤 역할인지(없으면 null)
    const res = await context.env.DB.prepare(
      "SELECT " +
        "  c.id, " +
        "  c.name, " +
        "  c.description, " +
        "  c.owner_id, " +
        "  c.is_private, " +
        "  c.created_at, " +
        "  m.role AS member_role, " +
        "  m.status AS member_status " +
        "FROM communities c " +
        "LEFT JOIN community_members m " +
        "  ON m.community_id = c.id AND m.user_id = ? " +
        "ORDER BY c.created_at DESC " +
        "LIMIT 100"
    )
      .bind(me)
      .all();

    const rows = res.results || [];

    const communities = rows.map(function (row) {
      const isMember =
        row.member_role === "owner" ||
        row.member_role === "admin" ||
        row.member_role === "member";
      const isPending = row.member_role === "pending";

      return {
        id: row.id,
        name: row.name,
        description: row.description || "",
        ownerId: row.owner_id,
        isPrivate: row.is_private === 1,
        createdAt: row.created_at,
        memberRole: row.member_role || null,
        memberStatus: row.member_status || null,
        isMember: !!isMember,
        isPending: !!isPending
      };
    });

    return Response.json({ ok: true, communities: communities });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
