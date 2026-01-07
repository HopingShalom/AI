export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { email, password } = body;

    if (!email || !password) {
      return Response.json({ ok: false, error: '이메일과 비밀번호를 입력해주세요' }, { status: 400 });
    }

    // 사용자 찾기
    const user = await context.env.DB.prepare(
      `SELECT id, display_name, password_hash FROM users WHERE email = ?`
    ).bind(email).first();

    if (!user || user.password_hash !== password) {
      return Response.json({ ok: false, error: '이메일 또는 비밀번호가 틀렸습니다' }, { status: 401 });
    }

    // 세션 토큰 생성
    const token = crypto.randomUUID();
    await context.env.DB.prepare(
      `INSERT INTO sessions (token, user_id) VALUES (?, ?)`
    ).bind(token, user.id).run();

    return Response.json({ ok: true, token, userId: user.id, displayName: user.display_name });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
