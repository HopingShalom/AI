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

    // 1) 기존 대화방에 보내는 경우
    if (convId) {
      const conv = await context.env.DB.prepare(
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

      // 기존에 두 사람 사이의 대화가 있는지 확인
      const existingConv = await context.env.DB.prepare(
        "SELECT id FROM dm_conversations " +
          "WHERE user_a_id = ? AND user_b_id = ? " +
          "LIMIT 1"
      )
        .bind(userA, userB)
        .first();

      if (existingConv) {
        convId = existingConv.id;
      } else {
        // 새 대화방 생성
        convId = "dm_" + crypto.randomUUID().slice(0, 8);
        await context.env.DB.prepare(
          "INSERT INTO dm_conversations (id, user_a_id, user_b_id) " +
            "VALUES (?, ?, ?)"
        )
          .bind(convId, userA, userB)
          .run();
      }
    }

    // 3) 메시지 저장 (현재는 항상 sender_type = 'user')
    const msgId = "dmmsg_" + crypto.randomUUID().slice(0, 8);

    await context.env.DB.prepare(
      "INSERT INTO dm_messages (id, conversation_id, sender_id, sender_type, content) " +
        "VALUES (?, ?, ?, 'user', ?)"
    )
      .bind(msgId, convId, me, content)
      .run();

    // 4) 대화방 업데이트 시간 갱신
    await context.env.DB.prepare(
      "UPDATE dm_conversations SET updated_at = datetime('now') WHERE id = ?"
    )
      .bind(convId)
      .run();

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
