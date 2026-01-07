export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { email, password, displayName, purposeTag } = body;

    // 간단 검증
    if (!email || !password || !displayName || !purposeTag) {
      return Response.json({ ok: false, error: '모든 필드를 입력해주세요' }, { status: 400 });
    }

    // 15세 이상 확인은 프론트에서 체크 (간소화)
    const userId = 'user_' + crypto.randomUUID().slice(0, 8);

    // 사용자 생성 (비밀번호는 데모용으로 평문 저장 - 실제 서비스에서는 해시 필수)
    await context.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, purpose_tag) VALUES (?, ?, ?, ?, ?)`
    ).bind(userId, email, password, displayName, purposeTag).run();

    // 세션 토큰 생성
    const token = crypto.randomUUID();
    await context.env.DB.prepare(
      `INSERT INTO sessions (token, user_id) VALUES (?, ?)`
    ).bind(token, userId).run();

    return Response.json({ ok: true, token, userId, displayName });
  } catch (e) {
    const msg = e?.message || String(e);
    if (msg.includes('UNIQUE constraint')) {
      return Response.json({ ok: false, error: '이미 가입된 이메일입니다' }, { status: 400 });
    }
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
