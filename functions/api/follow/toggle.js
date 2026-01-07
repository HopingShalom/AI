export async function onRequestPost(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return Response.json({ ok: false, error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    // 현재 사용자 확인
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();

    if (!session) {
      return Response.json({ ok: false, error: '유효하지 않은 세션입니다' }, { status: 401 });
    }

    const body = await context.request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return Response.json({ ok: false, error: '대상 사용자를 지정해주세요' }, { status: 400 });
    }

    if (session.user_id === targetUserId) {
      return Response.json({ ok: false, error: '자기 자신은 팔로우할 수 없습니다' }, { status: 400 });
    }

    // 이미 팔로우 중인지 확인
    const existing = await context.env.DB.prepare(
      `SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`
    ).bind(session.user_id, targetUserId).first();

    if (existing) {
      // 언팔로우
      await context.env.DB.prepare(
        `DELETE FROM follows WHERE follower_id = ? AND following_id = ?`
      ).bind(session.user_id, targetUserId).run();
      return Response.json({ ok: true, action: 'unfollowed' });
    } else {
      // 팔로우
      await context.env.DB.prepare(
        `INSERT INTO follows (follower_id, following_id) VALUES (?, ?)`
      ).bind(session.user_id, targetUserId).run();
      return Response.json({ ok: true, action: 'followed' });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
