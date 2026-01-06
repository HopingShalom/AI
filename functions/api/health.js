export async function onRequestGet(context) {
  const out = {
    ok: true,
    now: new Date().toISOString(),
    hasGeminiKey: !!context.env.GEMINI_API_KEY,
    d1: { ok: false }
  };

  try {
    // D1 binding 확인 및 버전 체크
    // SELECT sqlite_version() 호출 시 권한 에러가 발생한다면 Cloudflare D1 정책 변경 때문일 수 있습니다.
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
