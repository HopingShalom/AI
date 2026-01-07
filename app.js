// ===== 상태 =====
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let isRegisterMode = false;
let currentConversationId = null;

// ===== DOM 헬퍼 =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

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
  if (tab === 'chat') { showChatList(); loadConversations(); }
  if (tab === 'search') loadSearchUsers();
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
    <div class="feed-item" data-conv-id="${item.id}">
      <div class="feed-item-header">
        <span class="feed-user-name">${item.user.displayName}</span>
        ${item.user.isExpert ? `<span class="badge">${item.user.expertType || '전문가'}</span>` : ''}
        <span class="feed-user-tag">${item.user.purposeTag}</span>
      </div>
      <div class="feed-title">${item.title}</div>
      <div class="feed-preview">${item.preview}...</div>
      <div class="feed-meta">${new Date(item.createdAt).toLocaleDateString('ko-KR')}</div>
    </div>
  `).join('');
}

// ===== Chat =====
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
$('#chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  const container = $('#messagesContainer');

  // 사용자 메시지 즉시 표시
  if (container.querySelector('.muted')) container.innerHTML = '';
  container.innerHTML += `<div class="message user">${message}</div>`;
  container.innerHTML += `<div class="message assistant" id="typing">입력 중...</div>`;
  container.scrollTop = container.scrollHeight;

  const data = await api('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ conversationId: currentConversationId, message })
  });

  $('#typing')?.remove();

  if (data.ok) {
    currentConversationId = data.conversationId;
    container.innerHTML += `<div class="message assistant">${data.aiMessage.content}</div>`;
    container.scrollTop = container.scrollHeight;
  } else {
    container.innerHTML += `<div class="message assistant" style="color:var(--danger);">오류: ${data.error}</div>`;
  }
}

// 공개범위 설정
$('#chatSettingsBtn').addEventListener('click', () => {
  if (!currentConversationId) { alert('대화를 먼저 선택하세요.'); return; }
  $('#visibilityModal').classList.remove('hidden');
});

$('#closeVisibilityBtn').addEventListener('click', () => {
  $('#visibilityModal').classList.add('hidden');
});

$('#saveVisibilityBtn').addEventListener('click', async () => {
  const visibility = $('#visibilitySelect').value;
  const data = await api('/api/ai/visibility', {
    method: 'POST',
    body: JSON.stringify({ conversationId: currentConversationId, visibility })
  });
  if (data.ok) {
    alert('공개범위가 변경되었습니다.');
    $('#visibilityModal').classList.add('hidden');
  } else {
    alert('오류: ' + data.error);
  }
});

// ===== Search =====
async function loadSearchUsers(query = '') {
  const data = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
  const container = $('#searchResults');
  if (!data.ok || !data.users?.length) { container.innerHTML = '<p class="muted">검색 결과가 없습니다</p>'; return; }

  container.innerHTML = data.users.map(u => `
    <div class="user-card">
      <div class="user-info">
        <span class="user-name">${u.display_name}</span>
        ${u.is_expert ? `<span class="badge">${u.expert_type || '전문가'}</span>` : ''}
        <span class="user-purpose">${u.purpose_tag}</span>
      </div>
      <button class="btn-follow ${u.isFollowing ? 'following' : ''}" data-user-id="${u.id}">${u.isFollowing ? '팔로잉' : '팔로우'}</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-follow').forEach(btn => {
    btn.addEventListener('click', async () => {
      const data = await api('/api/follow/toggle', { method: 'POST', body: JSON.stringify({ targetUserId: btn.dataset.userId }) });
      if (data.ok) { btn.textContent = data.action === 'followed' ? '팔로잉' : '팔로우'; btn.classList.toggle('following', data.action === 'followed'); }
    });
  });
}

$('#searchInput')?.addEventListener('input', (e) => loadSearchUsers(e.target.value));

// ===== Profile =====
async function renderProfile() {
  if (!currentUser) return;
  const followData = await api('/api/follow/status');
  const visibilityLabels = { public: '전체 공개', followers: '팔로워만', private: '비공개' };

  $('#profileContent').innerHTML = `
    <div class="profile-header">
      <div class="profile-name">${currentUser.display_name} ${currentUser.is_expert ? `<span class="badge">${currentUser.expert_type || '전문가'}</span>` : ''}</div>
      <div class="profile-stats"><span><strong>${followData.followingCount || 0}</strong> 팔로잉</span><span><strong>${followData.followersCount || 0}</strong> 팔로워</span></div>
    </div>
    <div class="profile-section"><label>소개</label><textarea id="bioInput" placeholder="자기소개">${currentUser.bio || ''}</textarea></div>
    <div class="profile-section"><label>프로필 공개범위</label><select id="profileVisibilitySelect"><option value="public" ${currentUser.profile_visibility === 'public' ? 'selected' : ''}>전체 공개</option><option value="followers" ${currentUser.profile_visibility === 'followers' ? 'selected' : ''}>팔로워만</option><option value="private" ${currentUser.profile_visibility === 'private' ? 'selected' : ''}>비공개</option></select></div>
    <button id="saveProfileBtn" class="btn-primary">저장</button>
    <p id="profileMsg" class="msg hidden"></p>
    <hr style="margin:20px 0;border-color:var(--line);">
    <div class="profile-section"><label>이메일</label><p>${currentUser.email}</p></div>
    <div class="profile-section"><label>대화 목적</label><p>${currentUser.purpose_tag}</p></div>
  `;

  $('#saveProfileBtn').addEventListener('click', async () => {
    const bio = $('#bioInput').value;
    const profileVisibility = $('#profileVisibilitySelect').value;
    const data = await api('/api/profile/update', { method: 'POST', body: JSON.stringify({ bio, profileVisibility }) });
    const msg = $('#profileMsg');
    msg.classList.remove('hidden');
    msg.textContent = data.ok ? '저장되었습니다' : data.error;
    msg.style.color = data.ok ? 'var(--accent)' : 'var(--danger)';
    if (data.ok) { currentUser.bio = bio; currentUser.profile_visibility = profileVisibility; }
    setTimeout(() => msg.classList.add('hidden'), 2000);
  });
}

// ===== 탭 이벤트 =====
$$('.tab').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.tab)));

// ===== 초기화 =====
loadCurrentUser();
