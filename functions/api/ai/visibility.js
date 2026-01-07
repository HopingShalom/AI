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
    const { conversationId, visibility } = body;

    const validVisibility = ['public', 'followers', 'private'];
    if (!validVisibility.includes(visibility)) {
      return Response.json({ ok: false, error: '유효하지 않은 공개범위입니다' }, { status: 400 });
    }

    // 소유자 확인
    const conv = await context.env.DB.prepare(
      `SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?`
    ).bind(conversationId, session.user_id).first();

    if (!conv) {
      return Response.json({ ok: false, error: '대화를 찾을 수 없습니다' }, { status: 404 });
    }

    await context.env.DB.prepare(
      `UPDATE ai_conversations SET visibility = ? WHERE id = ?`
    ).bind(visibility, conversationId).run();

    await context.env.DB.prepare(
    `UPDATE posts 
     SET visibility = ? 
     WHERE ai_conversation_id = ? 
       AND user_id = ? 
       AND type = 'ai_share'`
    ).bind(visibility, conversationId, session.user_id).run();
    
    return Response.json({ ok: true, message: '공개범위가 변경되었습니다' });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
