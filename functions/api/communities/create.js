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
    const nameRaw = body && body.name ? String(body.name) : "";
    const descRaw =
      body && body.description ? String(body.description) : "";
    const isPrivateRaw = body && body.isPrivate;

    const name = nameRaw.trim();
    const description = descRaw.trim();

    if (!name) {
      return Response.json(
        { ok: false, error: "커뮤니티 이름을 입력해주세요" },
        { status: 400 }
      );
    }

    // 공개/비공개 플래그 처리
    const isPrivate =
      isPrivateRaw === true ||
      isPrivateRaw === 1 ||
      isPrivateRaw === "1" ||
      isPrivateRaw === "true"
        ? 1
        : 0;

    const commId = "comm_" + crypto.randomUUID().slice(0, 8);

    // 1) communities 테이블에 추가
    await context.env.DB.prepare(
      "INSERT INTO communities (id, name, description, owner_id, is_private) " +
        "VALUES (?, ?, ?, ?, ?)"
    )
      .bind(commId, name, description, me, isPrivate)
      .run();

    // 2) community_members에 owner로 추가
    await context.env.DB.prepare(
      "INSERT INTO community_members (community_id, user_id, role, status) " +
        "VALUES (?, ?, 'owner', 'active')"
    )
      .bind(commId, me)
      .run();

    return Response.json({
      ok: true,
      community: {
        id: commId,
        name: name,
        description: description,
        ownerId: me,
        isPrivate: isPrivate === 1
      }
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
