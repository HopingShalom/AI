export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const query = url.searchParams.get('q') || '';

  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  let currentUserId = null;
  if (token) {
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();
    if (session) currentUserId = session.user_id;
  }

  try {
    // 검색어가 없으면 전체 공개 사용자 목록 (본인 제외)
    let users;
    if (query) {
      users = await context.env.DB.prepare(
        `SELECT id, display_name, bio, purpose_tag, profile_visibility, is_expert, expert_type
         FROM users
         WHERE (display_name LIKE ? OR purpose_tag LIKE ?)
         AND profile_visibility = 'public'
         AND id != ?
         LIMIT 20`
      ).bind(`%${query}%`, `%${query}%`, currentUserId || '').all();
    } else {
      users = await context.env.DB.prepare(
        `SELECT id, display_name, bio, purpose_tag, profile_visibility, is_expert, expert_type
         FROM users
         WHERE profile_visibility = 'public'
         AND id != ?
         LIMIT 20`
      ).bind(currentUserId || '').all();
    }

    // 현재 사용자가 로그인한 경우, 팔로우 상태 추가
    let followingIds = [];
    if (currentUserId) {
      const following = await context.env.DB.prepare(
        `SELECT following_id FROM follows WHERE follower_id = ?`
      ).bind(currentUserId).all();
      followingIds = (following.results || []).map(f => f.following_id);
    }

    const usersWithFollow = (users.results || []).map(u => ({
      ...u,
      isFollowing: followingIds.includes(u.id)
    }));

    return Response.json({ ok: true, users: usersWithFollow });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
