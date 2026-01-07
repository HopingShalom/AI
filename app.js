// ===== 상태 =====
let currentUser = null;
let authToken = localStorage.getItem('authToken');
let isRegisterMode = false;
let currentConversationId = null; // My AI 대화용
let currentDmConversationId = null; // DM 대화용
let currentDmOtherUser = null; // { id, displayName, ... }

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
  if (tab === 'chat') {
    showChatList();
    loadConversations();  // My AI 대화 목록
    loadDmList();         // DM 대화 목록
  }
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
$('#chatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
  const input = $('#chatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  const container = $('#messagesContainer');
  if (container.querySelector('.muted')) container.innerHTML = '';
  container.innerHTML += `<div class="message user">${message}</div>`;
  container.innerHTML += `<div class="message assistant" id="typing">입력 중...</div>`;
  container.scrollTop = container.scrollHeight;
  const data = await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ conversationId: currentConversationId, message }) });
  $('#typing')?.remove();
  if (data.ok) {
    currentConversationId = data.conversationId;
    container.innerHTML += `<div class="message assistant">${data.aiMessage.content}</div>`;
    container.scrollTop = container.scrollHeight;
  } else {
    container.innerHTML += `<div class="message assistant" style="color:var(--danger);">오류: ${data.error}</div>`;
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

// DM 메시지 전송 (전체 목록 다시 가져오기 포함)
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

loadCurrentUser();
