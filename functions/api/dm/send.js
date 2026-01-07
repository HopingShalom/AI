export async function onRequestPost(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return Response.json(
      { ok: false, error: "로그인이 필요합니다" },
      { status: 401 }
    );
  }

  try {
    const session = await context.env.DB.prepare(
      "SELECT user_id FROM sessions WHERE token = ?"
    )
      .bind(token)
      .first();

    if (!session) {
      return Response.json(
        { ok: false, error: "유효하지 않은 세션입니다" },
        { status: 401 }
      );
    }

    const me = session.user_id;

    const body = await context.request.json();
    const conversationId =
      body && body.conversationId ? String(body.conversationId) : "";
    const targetUserId =
      body && body.targetUserId ? String(body.targetUserId) : "";
    const content = body && body.content ? String(body.content).trim() : "";

    if (!content) {
      return Response.json(
        { ok: false, error: "메시지를 입력해주세요" },
        { status: 400 }
      );
    }

    let convId = conversationId;
    let conv = null;

    // 1) 기존 대화방으로 보내는 경우
    if (convId) {
      conv = await context.env.DB.prepare(
        "SELECT id, user_a_id, user_b_id " +
          "FROM dm_conversations " +
          "WHERE id = ?"
      )
        .bind(convId)
        .first();

      if (!conv) {
        return Response.json(
          { ok: false, error: "대화를 찾을 수 없습니다" },
          { status: 404 }
        );
      }

      if (conv.user_a_id !== me && conv.user_b_id !== me) {
        return Response.json(
          { ok: false, error: "이 대화에 접근할 권한이 없습니다" },
          { status: 403 }
        );
      }
    } else {
      // 2) 새 DM 시작: targetUserId 필요
      if (!targetUserId) {
        return Response.json(
          {
            ok: false,
            error:
              "새 대화를 시작하려면 targetUserId 또는 기존 conversationId가 필요합니다"
          },
          { status: 400 }
        );
      }

      if (targetUserId === me) {
        return Response.json(
          { ok: false, error: "자기 자신에게는 DM을 보낼 수 없습니다" },
          { status: 400 }
        );
      }

      // 사용자 쌍을 정렬해서 중복 대화방 방지
      let userA = me;
      let userB = targetUserId;
      if (userA > userB) {
        const tmp = userA;
        userA = userB;
        userB = tmp;
      }

      const existingConv = await context.env.DB.prepare(
        "SELECT id, user_a_id, user_b_id " +
          "FROM dm_conversations " +
          "WHERE user_a_id = ? AND user_b_id = ? " +
          "LIMIT 1"
      )
        .bind(userA, userB)
        .first();

      if (existingConv) {
        convId = existingConv.id;
        conv = existingConv;
      } else {
        convId = "dm_" + crypto.randomUUID().slice(0, 8);
        await context.env.DB.prepare(
          "INSERT INTO dm_conversations (id, user_a_id, user_b_id) " +
            "VALUES (?, ?, ?)"
        )
          .bind(convId, userA, userB)
          .run();
        conv = { id: convId, user_a_id: userA, user_b_id: userB };
      }
    }

    // conv가 없는 경우를 대비해 보정
    if (!conv) {
      conv = await context.env.DB.prepare(
        "SELECT id, user_a_id, user_b_id " +
          "FROM dm_conversations " +
          "WHERE id = ?"
      )
        .bind(convId)
        .first();
      if (!conv) {
        return Response.json(
          { ok: false, error: "대화를 찾을 수 없습니다" },
          { status: 404 }
        );
      }
    }

    // 3) 사용자 메시지 저장 (항상 sender_type = 'user')
    const msgId = "dmmsg_" + crypto.randomUUID().slice(0, 8);

    await context.env.DB.prepare(
      "INSERT INTO dm_messages (id, conversation_id, sender_id, sender_type, content) " +
        "VALUES (?, ?, ?, 'user', ?)"
    )
      .bind(msgId, convId, me, content)
      .run();

    // 4) 대화방 updated_at 갱신
    await context.env.DB.prepare(
      "UPDATE dm_conversations SET updated_at = datetime('now') WHERE id = ?"
    )
      .bind(convId)
      .run();

    // 5) B AI 프록시 응답 (상대방이 proxy_enabled = 1인 경우에만)
    const otherUserId =
      conv.user_a_id === me ? conv.user_b_id : conv.user_a_id;

    const otherUser = await context.env.DB.prepare(
      "SELECT proxy_enabled, display_name FROM users WHERE id = ?"
    )
      .bind(otherUserId)
      .first();

    if (otherUser && otherUser.proxy_enabled === 1) {
      // 프록시 응답 생성 시도
      try {
        // 최근 DM 히스토리(최대 10개) 가져오기
        const histRes = await context.env.DB.prepare(
          "SELECT sender_id, sender_type, content " +
            "FROM dm_messages " +
            "WHERE conversation_id = ? " +
            "ORDER BY created_at DESC " +
            "LIMIT 10"
        )
          .bind(convId)
          .all();

        const hist = (histRes.results || []).slice().reverse();

        // Gemini 요청용 contents 구성
        // 관점: otherUser(B)의 AI가 me와 대화한다고 가정
        const contents = hist.map(function (m) {
          const isFromOther = m.sender_id === otherUserId;
          const role = isFromOther ? "model" : "user";
          return {
            role: role,
            parts: [{ text: m.content }]
          };
        });

        let proxyText = "";

        if (!context.env.GEMINI_API_KEY) {
          // 키가 없으면 간단한 데모 응답
          const lastUserMsg = content;
          proxyText =
            otherUser.display_name +
            "의 AI(데모)가 자동으로 답장합니다.\n\n" +
            "당신이 보낸 내용 요약:\n" +
            (lastUserMsg.length > 120
              ? lastUserMsg.slice(0, 120) + "…"
              : lastUserMsg);
        } else {
          // Gemini 호출
          const GEMINI_MODEL = "gemini-2.0-flash";
          const url =
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            GEMINI_MODEL +
            ":generateContent?key=" +
            context.env.GEMINI_API_KEY;

          const payload = { contents: contents };

          const aiRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!aiRes.ok) {
            // 쿼터 초과/기타 에러 → 데모 응답으로 대체
            let errJson = null;
            try {
              errJson = await aiRes.json();
            } catch (_) {}

            let code = null;
            let msg = "";
            if (errJson && errJson.error) {
              code = errJson.error.code;
              msg = errJson.error.message || "";
            }

            const lastUserMsg = content;
            if (code === 429) {
              proxyText =
                otherUser.display_name +
                "의 AI가 데모 모드로 응답합니다. (무료 사용 한도 초과)\n\n" +
                "당신이 보낸 내용 요약:\n" +
                (lastUserMsg.length > 120
                  ? lastUserMsg.slice(0, 120) + "…"
                  : lastUserMsg);
            } else {
              proxyText =
                otherUser.display_name +
                "의 AI가 응답 중 오류를 만났습니다.\n\n" +
                "최근 당신의 메시지:\n" +
                (lastUserMsg.length > 120
                  ? lastUserMsg.slice(0, 120) + "…"
                  : lastUserMsg) +
                (msg ? "\n\n(오류 정보: " + msg + ")" : "");
            }
          } else {
            const aiData = await aiRes.json();
            if (
              aiData &&
              Array.isArray(aiData.candidates) &&
              aiData.candidates.length > 0
            ) {
              const cand = aiData.candidates[0];
              if (
                cand &&
                cand.content &&
                Array.isArray(cand.content.parts) &&
                cand.content.parts.length > 0 &&
                typeof cand.content.parts[0].text === "string"
              ) {
                proxyText = cand.content.parts[0].text;
              }
            }

            if (!proxyText) {
              const lastUserMsg = content;
              proxyText =
                otherUser.display_name +
                "의 AI입니다. 조금 더 구체적으로 말씀해 주실 수 있을까요?\n\n" +
                "당신이 보낸 내용:\n" +
                (lastUserMsg.length > 120
                  ? lastUserMsg.slice(0, 120) + "…"
                  : lastUserMsg);
            }
          }
        }

        // 프록시 응답 메시지 저장 (sender_type = 'proxy_ai')
        const proxyMsgId = "dmmsg_" + crypto.randomUUID().slice(0, 8);
        await context.env.DB.prepare(
          "INSERT INTO dm_messages (id, conversation_id, sender_id, sender_type, content) " +
            "VALUES (?, ?, ?, 'proxy_ai', ?)"
        )
          .bind(proxyMsgId, convId, otherUserId, proxyText)
          .run();

        // updated_at 다시 갱신
        await context.env.DB.prepare(
          "UPDATE dm_conversations SET updated_at = datetime('now') WHERE id = ?"
        )
          .bind(convId)
          .run();
      } catch (eProxy) {
        // 프록시 응답 실패는 DM 전체 실패로 간주하지 않고 무시
      }
    }

    // 최종 응답 (사용자 메시지 정보만 내려줘도 충분)
    return Response.json({
      ok: true,
      conversationId: convId,
      message: {
        id: msgId,
        senderId: me,
        senderType: "user",
        content: content
      }
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
