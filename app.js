// ===== 상태 =====
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let isRegisterMode = false;
let currentConversationId = null; // My AI 대화용
let currentDmConversationId = null; // DM 대화용
let currentDmOtherUser = null; // { id, displayName, ... }
let currentCommunityId = null;
let currentCommunityName = null;

// ===== DOM 헬퍼 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showCrisisBanner() {
  const banner = $('#crisisBanner');
  if (!banner) return;
  banner.classList.remove('hidden');
}

$('#crisisBannerClose')?.addEventListener('click', () => {
  $('#crisisBanner')?.classList.add('hidden');
});

// ===== API 헬퍼 =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(path, { ...options, headers });
  return res.json();
}

// ===== 페이지 전환 =====
function showPage(tab) {
  $$('.page').forEach(el => el.classList.add('hidden'));
  $(`#page-${tab}`)?.classList.remove('hidden');
  $$('.tab').forEach(btn => btn.classList.remove('active'));
  $(`.tab[data-tab="${tab}"]`)?.classList.add('active');

  if (tab === 'feed') loadFeed();
  if (tab === 'chat') {
    showChatList();
    loadConversations();  // My AI 대화 목록
    loadDmList();         // DM 대화 목록
  }
  if (tab === 'search') {
    loadSearchUsers();
    loadCommunities();
  }
  if (tab === 'profile') renderProfile();
}

// ===== 인증 =====
const authModal = $('#authModal');
const authForm = $('#authForm');
const authError = $('#authError');

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  $('#authTitle').textContent = isRegisterMode ? '회원가입' : '로그인';
  $('#authSubmit').textContent = isRegisterMode ? '가입하기' : '로그인';
  $('#authSwitchText').textContent = isRegisterMode ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
  $('#authSwitchLink').textContent = isRegisterMode ? '로그인' : '회원가입';
  $('#registerFields').classList.toggle('hidden', !isRegisterMode);
  authError.classList.add('hidden');
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');
  const email = $('#authEmail').value;
  const password = $('#authPassword').value;

  try {
    if (isRegisterMode) {
      const displayName = $('#authName').value;
      const purposeTag = $('#authPurpose').value;
      if (!$('#authAge').checked) { authError.textContent = '만 15세 이상만 가입할 수 있습니다'; authError.classList.remove('hidden'); return; }
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName, purposeTag }) });
      if (!data.ok) { authError.textContent = data.error; authError.classList.remove('hidden'); return; }
      localStorage.setItem('authToken', data.token); authToken = data.token;
    } else {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      if (!data.ok) { authError.textContent = data.error; authError.classList.remove('hidden'); return; }
      localStorage.setItem('authToken', data.token); authToken = data.token;
    }
    await loadCurrentUser();
  } catch { authError.textContent = '네트워크 오류'; authError.classList.remove('hidden'); }
});

$('#authSwitchLink').addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });

async function loadCurrentUser() {
  if (!authToken) { authModal.classList.remove('hidden'); return; }
  const data = await api('/api/auth/me');
  if (!data.ok) { localStorage.removeItem('authToken'); authToken = null; authModal.classList.remove('hidden'); return; }
  currentUser = data.user;
  $('#userName').textContent = currentUser.display_name;
  $('#logoutBtn').classList.remove('hidden');
  authModal.classList.add('hidden');
  showPage('feed');
}

$('#logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('authToken'); authToken = null; currentUser = null;
  $('#userName').textContent = '로그인 필요';
  $('#logoutBtn').classList.add('hidden');
  authModal.classList.remove('hidden');
});

// ===== Feed =====
async function loadFeed() {
  const container = $('#feedContent');
  container.innerHTML = '<p class="muted">로딩 중...</p>';

  const data = await api('/api/feed');
  if (!data.ok || !data.feed?.length) {
    container.innerHTML = '<p class="muted">표시할 피드가 없습니다. 다른 사용자의 공개 AI 대화가 여기에 표시됩니다.</p>';
    return;
  }

  container.innerHTML = data.feed.map(item => `
    <div class="feed-item" data-conv-id="${item.id}" data-user-id="${item.user.id}">
      <div class="feed-item-header">
        <span class="feed-user-name clickable" data-user-id="${item.user.id}">${item.user.displayName}</span>
        ${item.user.isExpert ? `<span class="badge">${item.user.expertType || '전문가'}</span>` : ''}
        <span class="feed-user-tag">${item.user.purposeTag}</span>
      </div>
      <div class="feed-title">${item.title}</div>
      <div class="feed-preview">${item.preview}...</div>
      <div class="feed-meta">${new Date(item.createdAt).toLocaleDateString('ko-KR')}</div>
    </div>
  `).join('');

  container.querySelectorAll('.feed-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('feed-user-name')) return;
      const convId = item.dataset.convId;
      showPage('chat');
      openConversation(convId);
    });
  });

  container.querySelectorAll('.feed-user-name.clickable').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const userId = el.dataset.userId;
      await showUserProfile(userId);
    });
  });
}

async function showUserProfile(userId) {
  const data = await api(`/api/users/profile?userId=${userId}`);
  if (!data.ok) {
    alert('프로필을 불러올 수 없습니다.');
    return;
  }
  const u = data.user;
  alert(`👤 ${u.display_name}\n📌 ${u.purpose_tag}\n${u.is_expert ? '✓ ' + (u.expert_type || '전문가') : ''}\n\n${u.bio || '(소개 없음)'}`);
}

// ===== Chat (My AI) =====
function showChatList() {
  $('#chatList').classList.remove('hidden');
  $('#chatView').classList.add('hidden');
  currentConversationId = null;
}

function showChatView() {
  $('#chatList').classList.add('hidden');
  $('#chatView').classList.remove('hidden');
}

async function loadConversations() {
  const data = await api('/api/ai/conversations');
  const container = $('#conversationList');

  if (!data.ok || !data.conversations?.length) {
    container.innerHTML = '<p class="muted">대화가 없습니다. 새 대화를 시작해보세요.</p>';
    return;
  }

  const visibilityLabel = { public: '공개', followers: '팔로워', private: '비공개' };
  container.innerHTML = data.conversations.map(c => `
    <div class="conv-item" data-conv-id="${c.id}">
      <div class="conv-title">${c.title}</div>
      <div class="conv-meta">
        <span class="conv-visibility ${c.visibility}">${visibilityLabel[c.visibility]}</span>
        <span>${new Date(c.updated_at).toLocaleDateString('ko-KR')}</span>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.conv-item').forEach(item => {
    item.addEventListener('click', () => openConversation(item.dataset.convId));
  });
}

async function openConversation(convId) {
  currentConversationId = convId;
  showChatView();
  
  const data = await api(`/api/ai/messages?conversationId=${convId}`);
  const container = $('#messagesContainer');

  if (!data.ok) {
    container.innerHTML = '<p class="muted">메시지를 불러올 수 없습니다.</p>';
    return;
  }

  container.innerHTML = (data.messages || []).map(m => `
    <div class="message ${m.role}">${m.content}</div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

// My AI 대화 생성 및 메시지 전송 로직들 (중략: 기존 코드 유지)
$('#newChatBtn').addEventListener('click', () => {
  currentConversationId = null;
  showChatView();
  $('#messagesContainer').innerHTML = '<p class="muted">새 대화를 시작하세요.</p>';
  $('#chatTitle').textContent = 'My AI';
});

$('#backToListBtn').addEventListener('click', () => {
  showChatList();
  loadConversations();
});

$('#sendBtn').addEventListener('click', sendMessage);
$('#chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
async function sendMessage() {
  const input = $('#chatInput');
  const container = $('#messagesContainer');
  if (!input || !container) return;

  const text = input.value.trim();
  if (!text) return;

  // 입력 비우기
  input.value = '';

  // 첫 메시지면 안내 문구 제거
  if (container.querySelector('.muted')) container.innerHTML = '';

  // 내 메시지 표시
  container.innerHTML += `<div class="message user">${text.replace(/\n/g, '<br/>')}</div>`;
  // 입력 중 표시
  container.innerHTML += `<div class="message assistant" id="typing">입력 중...</div>`;
  container.scrollTop = container.scrollHeight;

  try {
    const data = await api('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: currentConversationId, // 이전 대화 있으면 이어서, 없으면 null
        message: text
      })
    });

    $('#typing')?.remove();

    if (!data.ok) {
      container.innerHTML += `<div class="message assistant" style="color:var(--danger);">오류: ${data.error || '응답 생성에 실패했습니다.'}</div>`;
      return;
    }

    // 백엔드에서 새 conversationId가 넘어오므로 갱신
    currentConversationId = data.conversationId;

    // AI 응답 렌더링
    const aiText = data.aiMessage && data.aiMessage.content
      ? String(data.aiMessage.content).replace(/\n/g, '<br/>')
      : '(응답 내용이 비어 있습니다)';

    container.innerHTML += `<div class="message assistant">${aiText}</div>`;
    container.scrollTop = container.scrollHeight;

    // 위기 키워드 감지 시 배너 표시
    if (data.crisisAlert) {
      showCrisisBanner();
    }
  } catch (e) {
    $('#typing')?.remove();
    container.innerHTML += `<div class="message assistant" style="color:var(--danger);">네트워크 오류</div>`;
  }
}

// ===== DM 관련 함수 =====

async function loadDmList() {
  const listEl = $('#dmList');
  if (!listEl) return;
  try {
    const data = await api('/api/dm/list');
    if (!data.ok) { listEl.innerHTML = `<p class="muted">DM 목록을 불러올 수 없습니다.</p>`; return; }
    const convs = data.conversations || [];
    if (!convs.length) { listEl.innerHTML = '<p class="muted">DM 대화가 없습니다.</p>'; return; }
    listEl.innerHTML = convs.map(c => {
      const last = c.lastMessage;
      const lastPreview = last ? (last.content.length > 40 ? last.content.slice(0, 40) + '…' : last.content) : '(메시지 없음)';
      return `
        <div class="user-card dm-item" data-dm-id="${c.id}" data-other-name="${c.otherUser.displayName}">
          <div>
            <div class="user-name">${c.otherUser.displayName}</div>
            <div class="muted" style="font-size:12px;">${lastPreview}</div>
          </div>
        </div>
      `;
    }).join('');
    listEl.querySelectorAll('.dm-item').forEach(item => {
      item.addEventListener('click', () => openDmConversation(item.dataset.dmId, { displayName: item.dataset.otherName }));
    });
  } catch (e) { listEl.innerHTML = '<p class="muted">네트워크 오류</p>'; }
}

async function openDmConversation(dmId, otherUser) {
  currentDmConversationId = dmId;
  currentDmOtherUser = otherUser;
  $('#dmList').classList.add('hidden');
  $('#dmView').classList.remove('hidden');
  $('#dmTitle').textContent = otherUser.displayName;
  const data = await api(`/api/dm/messages?conversationId=${encodeURIComponent(dmId)}`);
  if (data.ok) renderDmMessages(data.messages || []);
}

function renderDmMessages(messages) {
  const container = $('#dmMessages');
  if (!container) return;
  container.innerHTML = messages.map(m => {
    const mine = currentUser && m.sender_id === currentUser.id;
    const cls = mine ? 'message user' : 'message assistant';
    const label = m.sender_type === 'proxy_ai' ? '(AI)' : '';
    return `<div class="${cls}">${label ? `<small>${label}</small><br>` : ''}${m.content.replace(/\n/g, '<br>')}</div>`;
  }).join('');
  container.scrollTop = container.scrollHeight;
}

// DM 메시지 전송 (전체 목록 다시 가져오기 + 위기 배너)
async function sendDmMessage() {
  if (!currentDmConversationId) {
    alert('먼저 DM 대화를 선택하세요.');
    return;
  }
  const input = $('#dmInput');
  const dmMessages = $('#dmMessages');
  if (!input || !dmMessages) return;
  const text = input.value.trim();
  if (!text) return;

  // 입력 잠깐 비우고 비활성화
  input.value = '';
  input.disabled = true;

  // 임시 표시
  if (dmMessages.querySelector('.muted')) dmMessages.innerHTML = '';
  dmMessages.innerHTML += `<div class="message user">${text.replace(/\n/g, '<br/>')}</div>`;
  dmMessages.scrollTop = dmMessages.scrollHeight;

  try {
    const data = await api('/api/dm/send', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: currentDmConversationId,
        content: text
      })
    });

    if (!data.ok) {
      dmMessages.innerHTML += `<div class="message assistant" style="color:var(--danger);">오류: ${data.error || ''}</div>`;
      return;
    }

    // 위기 감지 플래그가 있으면 도움 배너 표시
    if (data.crisisAlert) {
      showCrisisBanner();
    }

    // 서버 기준 최신 상태 다시 불러오기 (프록시 AI 응답 포함)
    const reload = await api(`/api/dm/messages?conversationId=${encodeURIComponent(currentDmConversationId)}`);
    if (reload.ok) {
      renderDmMessages(reload.messages || []);
    }
  } catch (e) {
    dmMessages.innerHTML += `<div class="message assistant" style="color:var(--danger);">네트워크 오류</div>`;
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function closeDmView() {
  currentDmConversationId = null;
  $('#dmView').classList.add('hidden');
  $('#dmList').classList.remove('hidden');
}

// Search 탭에서 DM 시작
async function startDmFromSearch(targetUserId, displayName) {
  if (!authToken) {
    // 로그인 안 되어 있으면 로그인 모달 띄우기
    authModal.classList.remove('hidden');
    return;
  }

  try {
    // 새 DM을 시작하면서 첫 인사 메시지를 같이 보냄
    const initialText = '안녕하세요! DM을 시작해봤어요.';

    const data = await api('/api/dm/send', {
      method: 'POST',
      body: JSON.stringify({
        targetUserId,
        content: initialText
      })
    });

    if (!data.ok) {
      alert('DM 시작 중 오류가 발생했습니다: ' + (data.error || '알 수 없는 오류'));
      return;
    }

    const convId = data.conversationId;
    // Chat 탭으로 전환 후, DM 목록 갱신 & 방 열기
    showPage('chat');
    await loadDmList();
    openDmConversation(convId, { displayName });
  } catch (e) {
    alert('네트워크 오류로 DM을 시작하지 못했습니다.');
  }
}

// ===== Search =====
async function loadSearchUsers(query = '') {
  const data = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
  const container = $('#searchResults');
  if (!data.ok || !data.users?.length) {
    container.innerHTML = '<p class="muted">검색 결과가 없습니다</p>';
    return;
  }

  container.innerHTML = data.users.map(u => `
    <div class="user-card">
      <div class="user-info">
        <span class="user-name">${u.display_name}</span>
        ${u.is_expert ? `<span class="badge">${u.expert_type || '전문가'}</span>` : ''}
        <span class="user-purpose">${u.purpose_tag}</span>
      </div>
      <div>
        <button class="btn-follow ${u.isFollowing ? 'following' : ''}" data-user-id="${u.id}">
          ${u.isFollowing ? '팔로잉' : '팔로우'}
        </button>
        <button class="btn-dm" data-user-id="${u.id}" data-user-name="${u.display_name}">
          DM
        </button>
      </div>
    </div>
  `).join('');

  // 팔로우 버튼
  container.querySelectorAll('.btn-follow').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = await api('/api/follow/toggle', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: btn.dataset.userId })
      });
      if (data.ok) {
        btn.textContent = data.action === 'followed' ? '팔로잉' : '팔로우';
        btn.classList.toggle('following', data.action === 'followed');
      }
    });
  });

  // DM 버튼
  container.querySelectorAll('.btn-dm').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.userId;
      const userName = btn.dataset.userName;
      startDmFromSearch(userId, userName);
    });
  });
}
$('#searchInput')?.addEventListener('input', (e) => loadSearchUsers(e.target.value));

// ===== 커뮤니티 목록 불러오기 =====
async function loadCommunities() {
  const container = $('#communityList');
  if (!container) return;

  container.innerHTML = '<p class="muted">커뮤니티를 불러오는 중입니다...</p>';

  try {
    const data = await api('/api/communities/list');
    if (!data.ok) {
      container.innerHTML = `<p class="muted">커뮤니티를 불러올 수 없습니다: ${data.error || ''}</p>`;
      return;
    }

    const communities = data.communities || [];
    if (!communities.length) {
      container.innerHTML = '<p class="muted">아직 커뮤니티가 없습니다. 위에서 새 커뮤니티를 만들어 보세요.</p>';
      return;
    }

    container.innerHTML = communities.map(c => {
      const memberLabel = c.isMember
        ? (c.memberRole === 'owner' ? '소유자' :
           c.memberRole === 'admin' ? '관리자' :
           '멤버')
        : (c.isPending ? '승인 대기 중' : (c.isPrivate ? '비공개' : '공개'));

      let btnLabel = '';
      let btnClass = 'btn-join';
      let btnDisabled = false;

      if (c.isMember) {
        btnLabel = '참여 중';
        btnClass += ' joined';
        btnDisabled = true;
      } else if (c.isPending) {
        btnLabel = '승인 대기';
        btnClass += ' pending';
        btnDisabled = true;
      } else {
        btnLabel = '가입';
      }

      return `
        <div class="community-card" data-community-id="${c.id}">
          <div class="community-info">
            <div class="community-name">${c.name}</div>
            <div class="community-desc">${c.description || ''}</div>
            <div class="community-meta">
              ${c.isPrivate ? '비공개 / 승인제' : '공개 커뮤니티'} · ${memberLabel}
            </div>
          </div>
          <div>
            <button class="${btnClass}" data-community-id="${c.id}" ${btnDisabled ? 'disabled' : ''}>
              ${btnLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 가입 버튼 이벤트
    container.querySelectorAll('.btn-join').forEach(btn => {
      const disabled = btn.hasAttribute('disabled');
      if (disabled) return;

      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // 카드 클릭과 구분
        const commId = btn.dataset.communityId;
        try {
          const res = await api('/api/communities/join', {
            method: 'POST',
            body: JSON.stringify({ communityId: commId })
          });
          if (!res.ok) {
            alert('가입 중 오류가 발생했습니다: ' + (res.error || '알 수 없는 오류'));
            return;
          }
          await loadCommunities();
        } catch (e2) {
          alert('네트워크 오류로 가입 요청을 처리하지 못했습니다.');
        }
      });
    });

    // 커뮤니티 카드 클릭 → 해당 커뮤니티 글 열기
    container.querySelectorAll('.community-card').forEach(card => {
      card.addEventListener('click', () => {
        const commId = card.dataset.communityId;
        const nameEl = card.querySelector('.community-name');
        const name = nameEl ? nameEl.textContent.trim() : '커뮤니티';
        openCommunityPosts(commId, name);
      });
    });

  } catch (e) {
    container.innerHTML = '<p class="muted">커뮤니티를 불러오는 중 네트워크 오류가 발생했습니다.</p>';
  }
}

// 커뮤니티 글 열기
async function openCommunityPosts(communityId, communityName) {
  const section = $('#communityPosts');
  const titleEl = $('#communityPostsTitle');
  const descEl = $('#communityPostsDesc');
  const listEl = $('#communityPostsList');
  const msgEl = $('#communityPostMsg');
  const inputEl = $('#communityPostInput');
  const formEl = $('#communityPostForm');

  if (!section || !listEl) return;

  currentCommunityId = communityId;
  currentCommunityName = communityName;

  section.classList.remove('hidden');
  if (titleEl) titleEl.textContent = `커뮤니티: ${communityName}`;
  if (descEl) descEl.textContent = '';
  listEl.innerHTML = '<p class="muted">글을 불러오는 중입니다...</p>';
  if (msgEl) { msgEl.classList.add('hidden'); msgEl.textContent = ''; }
  if (inputEl) inputEl.value = '';

  try {
    const data = await api(`/api/communities/posts?communityId=${encodeURIComponent(communityId)}`);
    if (!data.ok) {
      listEl.innerHTML = `<p class="muted">글을 불러올 수 없습니다: ${data.error || ''}</p>`;
      if (formEl) formEl.classList.add('hidden');
      return;
    }
    renderCommunityPosts(data);
  } catch (e) {
    listEl.innerHTML = '<p class="muted">네트워크 오류로 글을 불러오지 못했습니다.</p>';
    if (formEl) formEl.classList.add('hidden');
  }
}

// 커뮤니티 글 렌더링
function renderCommunityPosts(data) {
  const section = $('#communityPosts');
  const listEl = $('#communityPostsList');
  const descEl = $('#communityPostsDesc');
  const formEl = $('#communityPostForm');

  if (!section || !listEl) return;

  const comm = data.community || {};
  const posts = data.posts || [];
  const isMember = !!data.isMember;

  if (descEl) {
    descEl.textContent = comm.description || '';
  }

  if (!posts.length) {
    listEl.innerHTML = isMember
      ? '<p class="muted">아직 글이 없습니다. 첫 번째 글을 남겨보세요.</p>'
      : '<p class="muted">아직 글이 없습니다. 멤버가 되면 글을 볼 수 있습니다.</p>';
  } else {
    listEl.innerHTML = posts.map(p => {
      const meta = `${new Date(p.createdAt).toLocaleString('ko-KR')} · ${p.author.displayName}`;
      const flag =
        p.moderationFlag === 'violation' ? ' (규칙 위반됨)' :
        p.moderationFlag === 'review' ? ' (검토 필요)' : '';
      return `
        <div class="user-card">
          <div class="user-info">
            <span class="user-name">${p.author.displayName}</span>
            ${p.author.isExpert ? `<span class="badge">${p.author.expertType || '전문가'}</span>` : ''}
            <span class="user-purpose">${p.author.purposeTag || ''}</span>
          </div>
          <div style="margin-top:6px;font-size:14px;line-height:1.5;">
            ${p.content.replace(/\n/g, '<br/>')}
          </div>
          <div class="muted" style="margin-top:4px;font-size:12px;">
            ${meta}${flag}
          </div>
        </div>
      `;
    }).join('');
  }

  // 멤버만 글 작성 폼 표시
  if (formEl) {
    if (isMember) formEl.classList.remove('hidden');
    else formEl.classList.add('hidden');
  }
}

// 커뮤니티 글 작성
async function submitCommunityPost() {
  if (!currentCommunityId) {
    alert('먼저 커뮤니티를 선택해주세요.');
    return;
  }

  const inputEl = $('#communityPostInput');
  const msgEl = $('#communityPostMsg');
  if (!inputEl || !msgEl) return;

  const text = inputEl.value.trim();
  if (!text) {
    msgEl.classList.remove('hidden');
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = '내용을 입력해주세요.';
    setTimeout(() => msgEl.classList.add('hidden'), 2000);
    return;
  }

  msgEl.classList.remove('hidden');
  msgEl.style.color = 'var(--muted)';
  msgEl.textContent = '작성 중...';

  try {
    const res = await api('/api/communities/post', {
      method: 'POST',
      body: JSON.stringify({
        communityId: currentCommunityId,
        content: text
      })
    });

    if (!res.ok) {
      msgEl.style.color = 'var(--danger)';
      msgEl.textContent = res.error || '글 작성 중 오류가 발생했습니다.';
      setTimeout(() => msgEl.classList.add('hidden'), 2500);
      return;
    }

    inputEl.value = '';
    msgEl.style.color = 'var(--accent)';
    msgEl.textContent = '작성되었습니다.';
    setTimeout(() => msgEl.classList.add('hidden'), 2000);

    // 최신 글 목록 다시 불러오기
    if (currentCommunityId && currentCommunityName) {
      openCommunityPosts(currentCommunityId, currentCommunityName);
    }
  } catch (e) {
    msgEl.style.color = 'var(--danger)';
    msgEl.textContent = '네트워크 오류로 글을 작성하지 못했습니다.';
    setTimeout(() => msgEl.classList.add('hidden'), 2500);
  }
}

// ===== Profile =====
async function renderProfile() {
  if (!currentUser) return;
  const followData = await api('/api/follow/status');
  
  $('#profileContent').innerHTML = `
    <div style="margin-bottom:16px;">
      <strong>이름:</strong> ${currentUser.display_name}
      ${currentUser.is_expert ? `<span class="badge">${currentUser.expert_type || '전문가'}</span>` : ''}
    </div>
    <div style="margin-bottom:16px;"><strong>이메일:</strong> ${currentUser.email}</div>
    <div style="margin-bottom:16px;"><strong>대화 목적:</strong> ${currentUser.purpose_tag}</div>
    
    <div class="profile-section">
      <label>소개</label>
      <textarea id="bioInput" placeholder="자기소개">${currentUser.bio || ''}</textarea>
    </div>

    <div class="profile-section">
      <label>프로필 공개범위</label>
      <select id="profileVisibilitySelect">
        <option value="public" ${currentUser.profile_visibility === 'public' ? 'selected' : ''}>전체 공개</option>
        <option value="followers" ${currentUser.profile_visibility === 'followers' ? 'selected' : ''}>팔로워만</option>
        <option value="private" ${currentUser.profile_visibility === 'private' ? 'selected' : ''}>비공개</option>
      </select>
    </div>

    <div class="profile-section">
      <label>DM 대리응답 (B의 AI)</label>
      <label class="checkbox-label">
        <input type="checkbox" id="proxyToggle" ${currentUser.proxy_enabled ? 'checked' : ''} />
        AI가 나를 대신해 DM에 답장하도록 허용 (실험 기능)
      </label>
      <p class="muted" style="font-size:12px;">
        상대가 나에게 DM을 보냈을 때, 내 AI가 1차 답장을 보낼 수 있습니다.
      </p>
    </div>

    <button id="saveProfileBtn" class="btn-primary">저장</button>
    <p id="profileMsg" class="msg hidden"></p>
    
    <hr style="margin:20px 0; border-color:var(--line);">
    <div class="profile-section"><label>이메일</label><p>${currentUser.email}</p></div>
    <div class="profile-section"><label>대화 목적</label><p>${currentUser.purpose_tag}</p></div>
  `;

  // 기존 저장 버튼 핸들러
  $('#saveProfileBtn').addEventListener('click', async () => {
    const bio = $('#bioInput').value;
    const profileVisibility = $('#profileVisibilitySelect').value;
    const data = await api('/api/profile/update', { 
      method: 'POST', 
      body: JSON.stringify({ bio, profileVisibility }) 
    });
    const msg = $('#profileMsg');
    msg.classList.remove('hidden');
    msg.textContent = data.ok ? '저장되었습니다' : data.error;
    if (data.ok) { currentUser.bio = bio; currentUser.profile_visibility = profileVisibility; }
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });

  // B AI(프록시) 토글 이벤트
  const proxyToggle = $('#proxyToggle');
  if (proxyToggle) {
    proxyToggle.addEventListener('change', async () => {
      const enabled = proxyToggle.checked;
      try {
        const res = await api('/api/profile/proxy', {
          method: 'POST',
          body: JSON.stringify({ enabled })
        });
        if (!res.ok) {
          alert('B AI 설정 변경 중 오류: ' + (res.error || '알 수 없는 오류'));
          proxyToggle.checked = !enabled;
          return;
        }
        if (currentUser) {
          currentUser.proxy_enabled = res.proxyEnabled;
        }
      } catch (e) {
        alert('네트워크 오류로 B AI 설정을 변경하지 못했습니다.');
        proxyToggle.checked = !enabled;
      }
    });
  }
}

// ===== 이벤트 리스너 및 초기화 =====
$$('.tab').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.tab)));
$('#dmSendBtn')?.addEventListener('click', sendDmMessage);
$('#dmInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendDmMessage(); });
$('#dmBackBtn')?.addEventListener('click', closeDmView);
$('#loadDmBtn')?.addEventListener('click', loadDmList);

// 커뮤니티 생성 버튼
$('#communityCreateBtn')?.addEventListener('click', async () => {
  const nameInput = $('#communityNameInput');
  const descInput = $('#communityDescInput');
  const privateInput = $('#communityPrivateInput');
  const msgEl = $('#communityCreateMsg');

  if (!nameInput || !descInput || !privateInput || !msgEl) return;

  const name = nameInput.value.trim();
  const desc = descInput.value.trim();
  const isPrivate = privateInput.checked;

  msgEl.classList.remove('hidden');
  msgEl.style.color = 'var(--danger)';

  if (!name) {
    msgEl.textContent = '커뮤니티 이름을 입력해주세요.';
    return;
  }

  try {
    const res = await api('/api/communities/create', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: desc,
        isPrivate
      })
    });

    if (!res.ok) {
      msgEl.textContent = res.error || '커뮤니티 생성 중 오류가 발생했습니다.';
      return;
    }

    msgEl.style.color = 'var(--accent)';
    msgEl.textContent = '커뮤니티가 생성되었습니다.';

    // 입력값 초기화
    nameInput.value = '';
    descInput.value = '';
    privateInput.checked = false;

    // 목록 갱신
    await loadCommunities();
  } catch (e) {
    msgEl.textContent = '네트워크 오류로 커뮤니티를 생성하지 못했습니다.';
  } finally {
    setTimeout(() => {
      msgEl.classList.add('hidden');
    }, 2000);
  }
});

// 커뮤니티 글 작성 버튼
$('#communityPostBtn')?.addEventListener('click', () => {
  submitCommunityPost();
});
$('#communityPostInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitCommunityPost();
  }
});

loadCurrentUser();
