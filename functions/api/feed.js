export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  let currentUserId = null;
  let followingIds = [];

  if (token) {
    const session = await context.env.DB.prepare(
      `SELECT user_id FROM sessions WHERE token = ?`
    ).bind(token).first();
    if (session) {
      currentUserId = session.user_id;
      const following = await context.env.DB.prepare(
        `SELECT following_id FROM follows WHERE follower_id = ?`
      ).bind(currentUserId).all();
      followingIds = (following.results || []).map(f => f.following_id);
    }
  }

  try {
    // 공개된 AI 대화 가져오기 (본인 제외, 최근 20개)
    const publicConversations = await context.env.DB.prepare(
      `SELECT c.id, c.title, c.visibility, c.created_at, c.user_id,
              u.display_name, u.purpose_tag, u.is_expert, u.expert_type
       FROM ai_conversations c
       JOIN users u ON c.user_id = u.id
       WHERE c.visibility = 'public' AND c.user_id != ?
       ORDER BY c.updated_at DESC
       LIMIT 20`
    ).bind(currentUserId || '').all();

    // 팔로워 공개 대화도 가져오기
    let followerConversations = { results: [] };
    if (followingIds.length > 0) {
      const placeholders = followingIds.map(() => '?').join(',');
      followerConversations = await context.env.DB.prepare(
        `SELECT c.id, c.title, c.visibility, c.created_at, c.user_id,
                u.display_name, u.purpose_tag, u.is_expert, u.expert_type
         FROM ai_conversations c
         JOIN users u ON c.user_id = u.id
         WHERE c.visibility = 'followers' AND c.user_id IN (${placeholders})
         ORDER BY c.updated_at DESC
         LIMIT 10`
      ).bind(...followingIds).all();
    }

    // 각 대화의 첫 메시지 미리보기 가져오기
    const allConvs = [...(publicConversations.results || []), ...(followerConversations.results || [])];
    
    const feedItems = await Promise.all(allConvs.map(async (conv) => {
      const preview = await context.env.DB.prepare(
        `SELECT content FROM ai_messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`
      ).bind(conv.id).first();

      return {
        type: 'ai_conversation',
        id: conv.id,
        title: conv.title,
        preview: preview?.content?.slice(0, 100) || '',
        visibility: conv.visibility,
        createdAt: conv.created_at,
        user: {
          id: conv.user_id,
          displayName: conv.display_name,
          purposeTag: conv.purpose_tag,
          isExpert: conv.is_expert,
          expertType: conv.expert_type
        }
      };
    }));

    // 시간순 정렬
    feedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return Response.json({ ok: true, feed: feedItems.slice(0, 20) });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
