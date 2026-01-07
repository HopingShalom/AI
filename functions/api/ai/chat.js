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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + context.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: messages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      }
    );

    let aiReply = "";

    if (!geminiResponse.ok) {
      // HTTP 에러 (429 포함) → 데모용 더미 응답으로 대체
      let errJson = null;
      try {
        errJson = await geminiResponse.json();
      } catch (_) {
        // json 파싱 실패 시 무시
      }

      let code = null;
      let msg = "";
      if (errJson && errJson.error) {
        code = errJson.error.code;
        msg = errJson.error.message || "";
      }

      if (code === 429) {
        // 쿼터 초과: 사용자에게는 친절한 문구 + 간단한 규칙 기반 답변
        aiReply =
          "지금 사용 중인 Gemini 모델의 무료 사용 한도가 초과되어, " +
          "대신 간단한 데모용 응답을 드릴게요.\n\n" +
          "당신의 메시지 요약:\n" +
          (message.length > 120 ? message.slice(0, 120) + "…" : message);
      } else {
        // 그 외 에러: 코드/메시지 요약
        aiReply =
          "AI 응답 생성 중 오류가 발생했습니다." +
          (code ? " (코드: " + code + ")" : "") +
          (msg ? " - " + msg : "");
      }
    } else {
      // HTTP 200 OK → 실제 Gemini 응답 파싱
      const geminiData = await geminiResponse.json();

      if (
        geminiData &&
        Array.isArray(geminiData.candidates) &&
        geminiData.candidates.length > 0
      ) {
        const cand = geminiData.candidates[0];
        if (
          cand &&
          cand.content &&
          Array.isArray(cand.content.parts) &&
          cand.content.parts.length > 0 &&
          typeof cand.content.parts[0].text === "string"
        ) {
          aiReply = cand.content.parts[0].text;
        }
      }

      if (!aiReply) {
        // 혹시라도 candidates가 비어 있는 경우
        aiReply =
          "모델이 이해하지 못한 것 같아요. 조금 더 구체적으로 말씀해 주실 수 있을까요?";
      }
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
