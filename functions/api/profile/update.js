export async function onRequestPost(context) {
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

    const body = await context.request.json();
    const { bio, profileVisibility } = body;

    // 공개범위 유효성 검사
    const validVisibility = ['public', 'followers', 'private'];
    if (profileVisibility && !validVisibility.includes(profileVisibility)) {
      return Response.json({ ok: false, error: '유효하지 않은 공개범위입니다' }, { status: 400 });
    }

    // 업데이트할 필드 구성
    const updates = [];
    const values = [];

    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (profileVisibility) {
      updates.push('profile_visibility = ?');
      values.push(profileVisibility);
    }

    if (updates.length === 0) {
      return Response.json({ ok: false, error: '변경할 내용이 없습니다' }, { status: 400 });
    }

    values.push(session.user_id);

    await context.env.DB.prepare(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return Response.json({ ok: true, message: '프로필이 업데이트되었습니다' });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
