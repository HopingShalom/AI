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
    const communityId =
      body && body.communityId ? String(body.communityId).trim() : "";

    if (!communityId) {
      return Response.json(
        { ok: false, error: "communityId가 필요합니다" },
        { status: 400 }
      );
    }

    // 커뮤니티 존재 여부 확인
    const comm = await context.env.DB.prepare(
      "SELECT id, name, owner_id, is_private " +
        "FROM communities " +
        "WHERE id = ?"
    )
      .bind(communityId)
      .first();

    if (!comm) {
      return Response.json(
        { ok: false, error: "커뮤니티를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 이미 멤버인지 확인
    const existing = await context.env.DB.prepare(
      "SELECT community_id, user_id, role, status " +
        "FROM community_members " +
        "WHERE community_id = ? AND user_id = ? " +
        "LIMIT 1"
    )
      .bind(communityId, me)
      .first();

    if (existing) {
      if (existing.status === "banned") {
        return Response.json(
          { ok: false, error: "이 커뮤니티에서 차단된 상태입니다" },
          { status: 403 }
        );
      }
      // 이미 멤버이거나 pending 상태이면 그 상태 그대로 안내
      const isMember =
        existing.role === "owner" ||
        existing.role === "admin" ||
        existing.role === "member";
      const isPending = existing.role === "pending";

      return Response.json({
        ok: true,
        already: true,
        communityId: communityId,
        memberRole: existing.role,
        memberStatus: existing.status,
        isMember: !!isMember,
        isPending: !!isPending
      });
    }

    // 공개/비공개에 따라 처리
    if (comm.is_private === 0) {
      // 공개 커뮤니티 → 바로 가입
      await context.env.DB.prepare(
        "INSERT INTO community_members (community_id, user_id, role, status) " +
          "VALUES (?, ?, 'member', 'active')"
      )
        .bind(communityId, me)
        .run();

      return Response.json({
        ok: true,
        joined: true,
        pending: false,
        communityId: communityId,
        role: "member"
      });
    } else {
      // 비공개 커뮤니티 → 가입 신청(pending)
      await context.env.DB.prepare(
        "INSERT INTO community_members (community_id, user_id, role, status) " +
          "VALUES (?, ?, 'pending', 'active')"
      )
        .bind(communityId, me)
        .run();

      return Response.json({
        ok: true,
        joined: false,
        pending: true,
        communityId: communityId,
        role: "pending"
      });
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
