export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const url = new URL(context.request.url);
  const conversationId = url.searchParams.get('conversationId');

  if (!token) {
    return Response.json({ ok: false, error: '로그인이 필요합니다' }, { status: 401 });
  }

  if (!conversationId) {
    return Response.json({ ok: false, error: '대화 ID가 필요합니다' }, { status: 400 });
  }

  try {
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();

    if (!session) {
      return Response.json({ ok: false, error: '유효하지 않은 세션입니다' }, { status: 401 });
    }

    // 대화 소유자 확인
    const conv = await context.env.DB.prepare(
      `SELECT id, user_id, visibility FROM ai_conversations WHERE id = ?`
    ).bind(conversationId).first();

    if (!conv) {
      return Response.json({ ok: false, error: '대화를 찾을 수 없습니다' }, { status: 404 });
    }

    // 본인 대화가 아니면 공개 여부 확인
    if (conv.user_id !== session.user_id && conv.visibility === 'private') {
      return Response.json({ ok: false, error: '비공개 대화입니다' }, { status: 403 });
    }

    const messages = await context.env.DB.prepare(
      `SELECT id, role, content, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC`
    ).bind(conversationId).all();

    return Response.json({ ok: true, messages: messages.results || [] });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
