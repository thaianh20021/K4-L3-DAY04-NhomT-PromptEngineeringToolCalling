/**
 * Northstar IT Helpdesk — OpenUI Generative Web Chat Engine
 * Reactive client implementation with OpenUI Component Renderer
 */

// State
let currentVersion = 'v3';
let conversationHistory = [];
let versionsMeta = {};
let isSending = false;

// DOM Elements
const versionControl = document.getElementById('versionControl');
const versionBanner = document.getElementById('versionBanner');
const bannerBadge = document.getElementById('bannerBadge');
const bannerDesc = document.getElementById('bannerDesc');
const statBase = document.getElementById('statBase');
const statGroup = document.getElementById('statGroup');
const statAdv = document.getElementById('statAdv');
const welcomeCard = document.getElementById('welcomeCard');
const messagesList = document.getElementById('messagesList');
const messagesViewport = document.getElementById('messagesViewport');
const typingBubble = document.getElementById('typingBubble');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const btnClearChat = document.getElementById('btnClearChat');
const modelIndicator = document.getElementById('modelIndicator');

// Modals
const modalVersion = document.getElementById('modalVersion');
const modalFixtures = document.getElementById('modalFixtures');
const modalBenchmark = document.getElementById('modalBenchmark');
const btnInspectVersion = document.getElementById('btnInspectVersion');
const btnViewFixtures = document.getElementById('btnViewFixtures');
const btnBenchmark = document.getElementById('btnBenchmark');

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
async function init() {
  await fetchStatus();
  await fetchVersions();
  setupEventListeners();
  autoResizeTextarea();
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.model) {
      modelIndicator.textContent = data.model;
    }
  } catch (err) {
    console.warn('Status fetch error:', err);
  }
}

async function fetchVersions() {
  try {
    const res = await fetch('/api/versions');
    versionsMeta = await res.json();
    updateVersionBanner(currentVersion);
  } catch (err) {
    console.warn('Versions fetch error:', err);
  }
}

function updateVersionBanner(versionId) {
  const meta = versionsMeta[versionId];
  if (!meta) return;

  bannerBadge.textContent = meta.name;
  bannerDesc.textContent = meta.description;
  statBase.textContent = meta.accuracy?.base || 'N/A';
  statGroup.textContent = meta.accuracy?.group || 'N/A';
  statAdv.textContent = meta.accuracy?.adversarial || 'N/A';

  // Highlight active button
  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.version === versionId);
  });
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------
function setupEventListeners() {
  // Version Switch
  versionControl.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment-btn');
    if (!btn) return;
    const newVersion = btn.dataset.version;
    if (newVersion !== currentVersion) {
      currentVersion = newVersion;
      updateVersionBanner(currentVersion);
      appendSystemNotification(`Đã chuyển sang phiên bản <strong>${versionsMeta[currentVersion]?.name || currentVersion}</strong>`);
    }
  });

  // Quick Chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt) {
        sendMessage(prompt);
      }
    });
  });

  // Chat Form Submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (text && !isSending) {
      sendMessage(text);
      messageInput.value = '';
      autoResizeTextarea();
    }
  });

  // Enter to send (Shift + Enter for newline)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Clear Chat
  btnClearChat.addEventListener('click', () => {
    if (confirm('Bạn có muốn xóa toàn bộ phiên hội thoại hiện tại không?')) {
      conversationHistory = [];
      messagesList.innerHTML = '';
      welcomeCard.classList.remove('hidden');
    }
  });

  // Modal Triggers
  btnInspectVersion.addEventListener('click', openVersionModal);
  btnViewFixtures.addEventListener('click', openFixturesModal);
  btnBenchmark.addEventListener('click', openBenchmarkModal);

  // Close modals
  document.querySelectorAll('.modal-close-btn, .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close-btn')) {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      }
    });
  });

  // Auto-resize textarea
  messageInput.addEventListener('input', autoResizeTextarea);
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
  setTimeout(() => {
    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }, 50);
}

// -------------------------------------------------------------
// Message Flow
// -------------------------------------------------------------
async function sendMessage(text) {
  if (isSending) return;
  isSending = true;

  // Hide welcome hero on first message
  welcomeCard.classList.add('hidden');

  // Render User Message
  appendUserMessage(text);
  conversationHistory.push({ role: 'user', content: text });

  // Show Typing
  typingBubble.classList.remove('hidden');
  scrollToBottom();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        version: currentVersion,
        history: conversationHistory
      })
    });

    const data = await response.json();
    typingBubble.classList.add('hidden');

    if (data.error) {
      appendBotMessage(`⚠️ ${data.error}`, [], []);
    } else {
      const assistantText = data.assistant_text || '';
      appendBotMessage(assistantText, data.openui_components || [], data.tool_events || []);
      conversationHistory.push({ role: 'assistant', content: assistantText });
    }
  } catch (err) {
    typingBubble.classList.add('hidden');
    appendBotMessage(`❌ Lỗi kết nối đến máy chủ: ${err.message}`, [], []);
  } finally {
    isSending = false;
    scrollToBottom();
  }
}

function appendUserMessage(text) {
  const row = document.createElement('div');
  row.className = 'message-row user-row';
  row.innerHTML = `
    <div class="msg-avatar user-avatar">Bạn</div>
    <div class="msg-content-wrapper">
      <div class="msg-bubble user-bubble">${escapeHtml(text)}</div>
      <div class="msg-timestamp">${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
    </div>
  `;
  messagesList.appendChild(row);
  scrollToBottom();
}

function appendBotMessage(text, openuiComponents, toolEvents) {
  const row = document.createElement('div');
  row.className = 'message-row bot-row';

  const avatar = `<div class="msg-avatar bot-avatar">AI</div>`;
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-content-wrapper';

  // Assistant Text Bubble
  if (text) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble bot-bubble';
    bubble.innerHTML = formatMarkdownText(text);
    wrapper.appendChild(bubble);
  }

  // OpenUI Generative Component Container
  if (openuiComponents && openuiComponents.length > 0) {
    const compContainer = document.createElement('div');
    compContainer.className = 'openui-container';

    openuiComponents.forEach(comp => {
      const compEl = renderOpenUIComponent(comp);
      if (compEl) {
        compContainer.appendChild(compEl);
      }
    });

    wrapper.appendChild(compContainer);
  }

  // Tool Trace Inspector (Developer accordion)
  if (toolEvents && toolEvents.length > 0) {
    const traceAccordion = createToolTraceAccordion(toolEvents);
    wrapper.appendChild(traceAccordion);
  }

  const timestamp = document.createElement('div');
  timestamp.className = 'msg-timestamp';
  timestamp.textContent = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ` • ${currentVersion.toUpperCase()}`;
  wrapper.appendChild(timestamp);

  row.innerHTML = avatar;
  row.appendChild(wrapper);
  messagesList.appendChild(row);
  scrollToBottom();
}

function appendSystemNotification(html) {
  const notif = document.createElement('div');
  notif.className = 'system-notification';
  notif.style.cssText = `
    text-align: center;
    font-size: 0.76rem;
    color: var(--text-muted);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--glass-border);
    padding: 6px 14px;
    border-radius: var(--radius-full);
    max-width: 400px;
    margin: 8px auto;
  `;
  notif.innerHTML = html;
  messagesList.appendChild(notif);
  scrollToBottom();
}

// -------------------------------------------------------------
// OpenUI Generative Component Renderer
// -------------------------------------------------------------
function renderOpenUIComponent(comp) {
  const type = comp.type;
  const props = comp.props || {};

  const card = document.createElement('div');
  card.className = 'openui-card';

  switch (type) {
    // 1. Service Status Card
    case 'OpenUI.ServiceStatusCard': {
      const isOperational = props.status === 'operational';
      const isDegraded = props.status === 'degraded';
      const statusClass = isOperational ? 'status-operational' : isDegraded ? 'status-degraded' : 'status-down';
      const statusLabel = isOperational ? 'Hoạt động tốt (Operational)' : isDegraded ? 'Bị suy giảm (Degraded)' : 'Sự cố (Outage)';

      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">🌐</span>
            <span class="openui-title">Dịch vụ: ${props.service.toUpperCase()}</span>
          </div>
          <span class="status-env-pill">${props.environment.toUpperCase()}</span>
        </div>
        <div class="openui-body">
          <div class="service-status-gauge ${statusClass}">
            <div class="status-ring">${isOperational ? '✓' : isDegraded ? '!' : '✕'}</div>
            <div class="status-details">
              <h4>${statusLabel}</h4>
              <span style="font-size:0.75rem;color:var(--text-muted);">Cập nhật: ${props.checked_at || 'Mới nhất'}</span>
            </div>
          </div>
          ${props.incident ? `
            <div class="incident-box">
              <div><span class="incident-id-tag">[${props.incident_id || 'INCIDENT'}]</span> ${escapeHtml(props.incident)}</div>
              ${props.workaround ? `<div style="margin-top:4px;color:var(--text-secondary);font-size:0.78rem;"><strong>Giải pháp tạm thời:</strong> ${escapeHtml(props.workaround)}</div>` : ''}
              ${props.affected_locations && props.affected_locations.length > 0 ? `
                <div class="locations-list">
                  <span style="font-size:0.7rem;color:var(--text-muted);align-self:center;">Vị trí ảnh hưởng:</span>
                  ${props.affected_locations.map(loc => `<span class="loc-tag">${escapeHtml(loc)}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
      return card;
    }

    // 2. Device Card
    case 'OpenUI.DeviceCard': {
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">💻</span>
            <span class="openui-title">Thiết bị: ${props.asset_id}</span>
          </div>
          <span class="status-env-pill">${props.manufacturer || 'Hardware'}</span>
        </div>
        <div class="openui-body">
          <div class="device-grid">
            <div class="device-prop">
              <div class="prop-label">Model</div>
              <div class="prop-value">${props.model || 'N/A'}</div>
            </div>
            <div class="device-prop">
              <div class="prop-label">Hệ điều hành (OS)</div>
              <div class="prop-value">${props.os || 'N/A'}</div>
            </div>
            <div class="device-prop">
              <div class="prop-label">Người được giao</div>
              <div class="prop-value" style="color:var(--accent-cyan);cursor:pointer;" onclick="sendMessage('Tra cứu nhân viên ${props.assigned_to}')">${props.assigned_to || 'Chưa cấp'}</div>
            </div>
            <div class="device-prop">
              <div class="prop-label">Vị trí</div>
              <div class="prop-value">${props.location || 'N/A'}</div>
            </div>
            ${props.diagnostics ? `
              <div class="diagnostics-box">
                <div style="font-weight:700;margin-bottom:4px;color:#fff;">🔍 Kết quả Diagnostics (${props.check}):</div>
                <div>${typeof props.diagnostics === 'object' ? JSON.stringify(props.diagnostics, null, 2) : props.diagnostics}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      return card;
    }

    // 3. User Card
    case 'OpenUI.UserCard': {
      const statusClass = props.account_status === 'active' ? 'status-active' : props.account_status === 'locked' ? 'status-locked' : 'status-disabled';
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">👤</span>
            <span class="openui-title">Hồ sơ nhân viên</span>
          </div>
          <span class="emp-id-tag">${props.employee_id}</span>
        </div>
        <div class="openui-body">
          <div class="user-profile-layout">
            <div class="user-avatar-badge">${props.display_name.substring(0, 2).toUpperCase()}</div>
            <div class="user-names">
              <h4>${props.display_name} <span class="account-status-badge ${statusClass}">${props.account_status}</span></h4>
              <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">
                Phòng ban: <strong>${props.department || 'N/A'}</strong> • Văn phòng: <strong>${props.office || 'N/A'}</strong>
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
                MFA: <strong>${props.mfa_status || 'not_enrolled'}</strong>
              </div>
            </div>
          </div>
          ${props.assigned_assets && props.assigned_assets.length > 0 ? `
            <div style="border-top:1px solid var(--glass-border);padding-top:10px;">
              <span style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Thiết bị được bàn giao:</span>
              <div style="display:flex;gap:8px;margin-top:6px;">
                ${props.assigned_assets.map(asset => `
                  <button class="action-btn action-btn-secondary" style="padding:4px 10px;font-size:0.78rem;" onclick="sendMessage('Kiểm tra tổng thể thiết bị ${asset}')">
                    💻 ${asset}
                  </button>
                `).join('')}
              </div>
            </div>
          ` : '<div style="font-size:0.78rem;color:var(--text-muted);">Không có thiết bị nào được gán.</div>'}
        </div>
      `;
      return card;
    }

    // 4. Clarify Prompt (Interactive Action Buttons)
    case 'OpenUI.ClarifyPrompt': {
      card.className = 'openui-clarify-box';
      let buttonsHtml = '';

      if (props.response_type === 'yes_no') {
        buttonsHtml = `
          <button class="action-btn action-btn-primary" onclick="sendMessage('Có, tôi xác nhận')">
            ✓ Có, tôi xác nhận
          </button>
          <button class="action-btn action-btn-secondary" onclick="sendMessage('Hủy bỏ yêu cầu này')">
            ✕ Hủy bỏ
          </button>
        `;
      } else if (props.response_type === 'choice' && props.options && props.options.length > 0) {
        buttonsHtml = props.options.map(opt => `
          <button class="action-btn action-btn-primary" onclick="sendMessage('${opt}')">
            ${opt}
          </button>
        `).join('');
      } else {
        buttonsHtml = `
          <button class="action-btn action-btn-secondary" onclick="messageInput.focus();">
            ✍️ Bổ sung thông tin vào khung chat
          </button>
        `;
      }

      card.innerHTML = `
        <div class="clarify-header">
          <span>⚠️ Cần xác nhận / Thông tin bổ sung</span>
        </div>
        <div class="clarify-question">${escapeHtml(props.question)}</div>
        <div class="clarify-actions">
          ${buttonsHtml}
        </div>
      `;
      return card;
    }

    // 5. Ticket Card
    case 'OpenUI.TicketCard': {
      const priorityClass = `priority-${props.priority || 'medium'}`;
      card.className = 'openui-card ticket-form-card';
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">🎫</span>
            <span class="openui-title">Ticket Sự Cố: ${props.summary || 'IT Incident'}</span>
          </div>
          <span class="ticket-priority-tag ${priorityClass}">${props.priority || 'MEDIUM'}</span>
        </div>
        <div class="openui-body">
          <div style="font-size:0.86rem;margin-bottom:10px;">
            Thiết bị liên quan: <strong>${props.asset_id || 'Chưa gán'}</strong>
          </div>
          <div style="background:rgba(255,255,255,0.03);padding:10px 12px;border-radius:var(--radius-sm);font-size:0.82rem;color:var(--text-secondary);">
            <strong>Trạng thái tạo:</strong> ${props.status || 'needs_confirmation'}<br/>
            ${props.message ? `<em>${escapeHtml(props.message)}</em>` : ''}
          </div>
        </div>
      `;
      return card;
    }

    // 6. Knowledge Base Card
    case 'OpenUI.KnowledgeBaseCard': {
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">📚</span>
            <span class="openui-title">Knowledge Base (${props.results_count} bài viết)</span>
          </div>
          <span class="status-env-pill">${props.category || 'all'}</span>
        </div>
        <div class="openui-body">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">Truy vấn: <em>"${escapeHtml(props.query)}"</em></div>
          ${(props.results || []).map(r => `
            <div style="background:rgba(255,255,255,0.02);padding:10px;border-radius:6px;margin-bottom:6px;font-size:0.84rem;">
              <strong>${escapeHtml(r.title || 'Hướng dẫn')}</strong>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">${escapeHtml(r.snippet || r.content || '')}</div>
            </div>
          `).join('')}
          ${props.trust_boundary ? `<div style="font-size:0.7rem;color:var(--accent-emerald);margin-top:6px;">🛡️ ${escapeHtml(props.trust_boundary)}</div>` : ''}
        </div>
      `;
      return card;
    }

    // 7. Policy Card
    case 'OpenUI.PolicyCard': {
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">📜</span>
            <span class="openui-title">Chính sách công ty (${props.policy_area})</span>
          </div>
          <span class="status-env-pill">Internal Policy</span>
        </div>
        <div class="openui-body">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;">Tra cứu: <em>"${escapeHtml(props.query)}"</em></div>
          ${(props.results || []).map(r => `
            <div style="background:rgba(255,255,255,0.02);padding:10px;border-radius:6px;margin-bottom:6px;font-size:0.84rem;">
              <strong>${escapeHtml(r.title || r.policy || 'Điều khoản')}</strong>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">${escapeHtml(r.snippet || r.content || '')}</div>
            </div>
          `).join('')}
        </div>
      `;
      return card;
    }

    // 8. Incident Report Card
    case 'OpenUI.IncidentReportCard': {
      card.innerHTML = `
        <div class="openui-header">
          <div class="openui-header-left">
            <span class="openui-type-icon">📋</span>
            <span class="openui-title">${escapeHtml(props.incident_title)}</span>
          </div>
          <button class="action-btn action-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="navigator.clipboard.writeText(\`${escapeHtml(props.markdown)}\`); alert('Đã sao chép báo cáo Markdown!');">
            Copy MD
          </button>
        </div>
        <div class="openui-body">
          <div style="font-family:var(--font-mono);font-size:0.82rem;background:#090c13;padding:12px;border-radius:6px;white-space:pre-wrap;color:#e2e8f0;">${escapeHtml(props.markdown)}</div>
        </div>
      `;
      return card;
    }

    default:
      return null;
  }
}

// -------------------------------------------------------------
// Tool Trace Drawer / Inspector
// -------------------------------------------------------------
function createToolTraceAccordion(toolEvents) {
  const container = document.createElement('div');

  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'tool-trace-toggle';
  toggleBtn.innerHTML = `
    <span>🛠️ <strong>Tool Calling Execution</strong> (${toolEvents.length} tools called)</span>
    <span>Chi tiết ▼</span>
  `;

  const drawer = document.createElement('div');
  drawer.className = 'tool-trace-drawer hidden';
  drawer.innerHTML = `<pre>${escapeHtml(JSON.stringify(toolEvents, null, 2))}</pre>`;

  toggleBtn.addEventListener('click', () => {
    const isHidden = drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden');
    toggleBtn.querySelector('span:last-child').textContent = isHidden ? 'Ẩn ▲' : 'Chi tiết ▼';
  });

  container.appendChild(toggleBtn);
  container.appendChild(drawer);
  return container;
}

// -------------------------------------------------------------
// Modals Handlers
// -------------------------------------------------------------
function openVersionModal() {
  const body = document.getElementById('versionModalBody');
  body.innerHTML = Object.values(versionsMeta).map(v => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--glass-border);padding:16px;border-radius:var(--radius-md);margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <h4 style="color:#fff;font-size:1.05rem;">${v.name}</h4>
        <span style="font-size:0.72rem;background:rgba(56,189,248,0.15);color:var(--accent-cyan);padding:2px 8px;border-radius:4px;font-weight:700;">${v.badge}</span>
      </div>
      <p style="color:var(--text-secondary);font-size:0.84rem;margin-bottom:10px;">${v.description}</p>
      <div style="display:flex;gap:12px;font-size:0.78rem;margin-bottom:10px;">
        <div>Base Eval: <strong style="color:var(--accent-cyan);">${v.accuracy.base}</strong></div>
        <div>Group Eval: <strong style="color:var(--accent-emerald);">${v.accuracy.group}</strong></div>
        <div>Adversarial: <strong style="color:var(--accent-amber);">${v.accuracy.adversarial}</strong></div>
      </div>
      <details style="margin-top:6px;font-family:var(--font-mono);font-size:0.76rem;">
        <summary style="cursor:pointer;color:var(--accent-cyan);">Xem System Prompt của ${v.id.toUpperCase()}</summary>
        <pre style="background:#090c13;padding:10px;border-radius:6px;margin-top:6px;white-space:pre-wrap;color:#cbd5e1;max-height:200px;overflow-y:auto;">${escapeHtml(v.prompt)}</pre>
      </details>
    </div>
  `).join('');
  modalVersion.classList.remove('hidden');
}

async function openFixturesModal() {
  const content = document.getElementById('fixturesTabContent');
  content.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);">Đang tải dữ liệu mock...</div>`;
  modalFixtures.classList.remove('hidden');

  try {
    const res = await fetch('/api/fixtures');
    const data = await res.json();

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        renderFixturesTab(tab, data);
      };
    });

    renderFixturesTab('tabUsers', data);
  } catch (err) {
    content.innerHTML = `<div style="color:var(--accent-rose);">Lỗi tải fixtures: ${err.message}</div>`;
  }
}

function renderFixturesTab(tab, data) {
  const content = document.getElementById('fixturesTabContent');
  if (tab === 'tabUsers') {
    content.innerHTML = (data.users || []).map(u => `
      <div style="background:rgba(255,255,255,0.02);padding:10px 14px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <strong style="color:#fff;">${u.display_name}</strong> (${u.employee_id})
          <div style="font-size:0.76rem;color:var(--text-muted);">${u.department} • ${u.office}</div>
        </div>
        <button class="action-btn action-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="modalFixtures.classList.add('hidden'); sendMessage('Tra cứu nhân viên ${u.employee_id}');">
          Tra cứu
        </button>
      </div>
    `).join('');
  } else if (tab === 'tabAssets') {
    content.innerHTML = (data.assets || []).map(a => `
      <div style="background:rgba(255,255,255,0.02);padding:10px 14px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <strong style="color:#fff;">${a.asset_id}</strong> — ${a.model} (${a.manufacturer})
          <div style="font-size:0.76rem;color:var(--text-muted);">OS: ${a.os} • Người dùng: ${a.assigned_to || 'N/A'}</div>
        </div>
        <button class="action-btn action-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="modalFixtures.classList.add('hidden'); sendMessage('Kiểm tra tổng thể thiết bị ${a.asset_id}');">
          Kiểm tra
        </button>
      </div>
    `).join('');
  } else if (tab === 'tabServices') {
    content.innerHTML = (data.services || []).map(s => `
      <div style="background:rgba(255,255,255,0.02);padding:10px 14px;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <strong style="color:#fff;">${s.service.toUpperCase()}</strong> (${s.environment})
          <div style="font-size:0.76rem;color:${s.status === 'operational' ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">${s.status.toUpperCase()} ${s.incident ? `— ${s.incident}` : ''}</div>
        </div>
        <button class="action-btn action-btn-secondary" style="padding:4px 10px;font-size:0.75rem;" onclick="modalFixtures.classList.add('hidden'); sendMessage('Kiểm tra dịch vụ ${s.service} ${s.environment}');">
          Check
        </button>
      </div>
    `).join('');
  }
}

async function openBenchmarkModal() {
  const body = document.getElementById('benchmarkModalBody');
  body.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);">Đang đọc lịch sử chạy eval...</div>`;
  modalBenchmark.classList.remove('hidden');

  try {
    const res = await fetch('/api/runs');
    const data = await res.json();
    body.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.84rem;text-align:left;">
        <thead>
          <tr style="border-bottom:1px solid var(--glass-border);color:var(--text-muted);">
            <th style="padding:8px;">Version</th>
            <th style="padding:8px;">Suite</th>
            <th style="padding:8px;">Accuracy</th>
            <th style="padding:8px;">Passed/Total</th>
            <th style="padding:8px;">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          ${(data.runs || []).map(r => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
              <td style="padding:8px;"><span class="v-pill" style="color:var(--accent-cyan);font-weight:700;">${r.version}</span></td>
              <td style="padding:8px;text-transform:uppercase;font-size:0.76rem;">${r.suite}</td>
              <td style="padding:8px;color:${r.case_accuracy === 1 ? 'var(--accent-emerald)' : 'var(--accent-amber)'};font-weight:700;">${(r.case_accuracy * 100).toFixed(1)}%</td>
              <td style="padding:8px;">${r.passed_cases}/${r.total_cases}</td>
              <td style="padding:8px;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);">${r.generated_at ? r.generated_at.replace('T', ' ') : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--accent-rose);">Lỗi tải benchmark: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdownText(text) {
  if (!text) return '';
  // Try to parse clean bold, list, code block
  let html = escapeHtml(text);
  // Code block
  html = html.replace(/```([\s\S]*?)```/g, '<pre style="background:#090c13;padding:8px;border-radius:4px;overflow-x:auto;"><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 5px;border-radius:4px;font-family:var(--font-mono);color:var(--accent-cyan);">$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Linebreaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

// Startup
document.addEventListener('DOMContentLoaded', init);
