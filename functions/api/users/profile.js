export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return Response.json({ ok: false, error: '사용자 ID가 필요합니다' }, { status: 400 });
  }

  try {
    const user = await context.env.DB.prepare(
      `SELECT id, display_name, bio, purpose_tag, profile_visibility, is_expert, expert_type 
       FROM users WHERE id = ?`
    ).bind(userId).first();

    if (!user) {
      return Response.json({ ok: false, error: '사용자를 찾을 수 없습니다' }, { status: 404 });
    }

    // 비공개 프로필은 제한된 정보만 반환
    if (user.profile_visibility === 'private') {
      return Response.json({ 
        ok: true, 
        user: { 
          id: user.id, 
          display_name: user.display_name, 
          purpose_tag: '(비공개)', 
          bio: '(비공개 프로필)' 
        } 
      });
    }

    return Response.json({ ok: true, user });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
