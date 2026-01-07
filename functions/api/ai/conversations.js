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

    const conversations = await context.env.DB.prepare(
      `SELECT id, title, visibility, created_at, updated_at 
       FROM ai_conversations 
       WHERE user_id = ? 
       ORDER BY updated_at DESC`
    ).bind(session.user_id).all();

    return Response.json({ ok: true, conversations: conversations.results || [] });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
