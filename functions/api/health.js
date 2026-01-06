export async function onRequestGet(context) {
  const out = {
    ok: true,
    now: new Date().toISOString(),
    hasGeminiKey: !!context.env.GEMINI_API_KEY,
    d1: { ok: false }
  };

  try {
    // D1 binding은 Pages 프로젝트 Settings > Bindings 에서 Variable name을 DB로 설정해야 함
    // 예시는 context.env.<BINDING>.prepare(...) 형태로 접근함 <!--citation:3-->
    const row = await context.env.DB
      .prepare("SELECT sqlite_version() AS v")
      .first();

    out.d1.ok = true;
    out.d1.sqlite_version = row?.v ?? null;
  } catch (e) {
    out.ok = false;
    out.d1.ok = false;
    out.d1.error = String(e && e.message ? e.message : e);
  }

  return Response.json(out);
}
