export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return Response.json({ ok: false, error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();

    if (!session) {
      return Response.json({ ok: false, error: '유효하지 않은 세션입니다' }, { status: 401 });
    }

    // 팔로잉 목록
    const following = await context.env.DB.prepare(
      `SELECT u.id, u.display_name, u.purpose_tag, u.is_expert, u.expert_type
       FROM follows f JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = ?`
    ).bind(session.user_id).all();

    // 팔로워 목록
    const followers = await context.env.DB.prepare(
      `SELECT u.id, u.display_name, u.purpose_tag, u.is_expert, u.expert_type
       FROM follows f JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = ?`
    ).bind(session.user_id).all();

    return Response.json({
      ok: true,
      following: following.results || [],
      followers: followers.results || [],
      followingCount: following.results?.length || 0,
      followersCount: followers.results?.length || 0
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
