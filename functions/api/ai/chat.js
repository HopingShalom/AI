export async function onRequestPost(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return Response.json({ ok: false, error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    // 세션 확인
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();

    if (!session) {
      return Response.json({ ok: false, error: '유효하지 않은 세션입니다' }, { status: 401 });
    }

    const body = await context.request.json();
    const { conversationId, message } = body;

    if (!message || !message.trim()) {
      return Response.json({ ok: false, error: '메시지를 입력해주세요' }, { status: 400 });
    }

    let convId = conversationId;

    // 새 대화 생성 또는 기존 대화 확인
    if (!convId) {
      convId = 'conv_' + crypto.randomUUID().slice(0, 8);
      await context.env.DB.prepare(
        `INSERT INTO ai_conversations (id, user_id, title) VALUES (?, ?, ?)`
      ).bind(convId, session.user_id, message.slice(0, 30) + '...').run();
    } else {
      const conv = await context.env.DB.prepare(
        `SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?`
      ).bind(convId, session.user_id).first();
      if (!conv) {
        return Response.json({ ok: false, error: '대화를 찾을 수 없습니다' }, { status: 404 });
      }
    }

    // 사용자 메시지 저장
    const userMsgId = 'msg_' + crypto.randomUUID().slice(0, 8);
    await context.env.DB.prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`
    ).bind(userMsgId, convId, message).run();

    // 이전 메시지 가져오기 (컨텍스트용, 최근 10개)
    const history = await context.env.DB.prepare(
      `SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10`
    ).bind(convId).all();

    const messages = (history.results || []).reverse().map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    // Gemini API 호출
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${context.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    let aiReply = '죄송합니다. 응답을 생성할 수 없습니다.';
    if (geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
  aiReply = geminiData.candidates[0].content.parts.text;
    }

    // AI 응답 저장
    const aiMsgId = 'msg_' + crypto.randomUUID().slice(0, 8);
    await context.env.DB.prepare(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES (?, ?, 'assistant', ?)`
    ).bind(aiMsgId, convId, aiReply).run();

    // 대화 업데이트 시간 갱신
    await context.env.DB.prepare(
      `UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?`
    ).bind(convId).run();

    return Response.json({
      ok: true,
      conversationId: convId,
      userMessage: { id: userMsgId, role: 'user', content: message },
      aiMessage: { id: aiMsgId, role: 'assistant', content: aiReply }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
