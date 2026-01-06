export async function onRequestGet(context) {
  const out = {
    ok: true,
    now: new Date().toISOString(),
    hasGeminiKey: !!context.env.GEMINI_API_KEY,
    d1: { ok: false }
  };

  try {
    // D1 연결 확인: 단순히 1을 조회하여 응답이 오는지 체크합니다.
    const result = await context.env.DB
      .prepare("SELECT 1")
      .run();

    if (result.success) {
      out.d1.ok = true;
    }
  } catch (e) {
    out.ok = false;
    out.d1.ok = false;
    out.d1.error = String(e && e.message ? e.message : e);
  }

  return Response.json(out);
}
