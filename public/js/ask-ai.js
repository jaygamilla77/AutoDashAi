/* eslint-disable */
/**
 * Ask AI — conversational analytics client (Phase 1).
 * Single global namespace `window.AskAI`.
 */
(function () {
  'use strict';

  var state = {
    currentThreadId: null,
    sending: false,
  };

  var $thread   = document.getElementById('chatThread');
  var $empty    = document.getElementById('emptyState');
  var $input    = document.getElementById('composerInput');
  var $sendBtn  = document.getElementById('sendBtn');
  var $sessions = document.getElementById('sessionList');
  var $newBtn   = document.getElementById('newThreadBtn');
  var $heading  = document.getElementById('threadHeading');
  var $subtitle = document.getElementById('threadSubtitle');

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdown(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    // code blocks ```...```
    html = html.replace(/```([\s\S]*?)```/g, function (_, code) {
      return '<pre><code>' + code.replace(/^\n/, '') + '</code></pre>';
    });
    // inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // bold
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // italic
    html = html.replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<em>$2</em>');
    // bullet lists
    html = html.replace(/(^|\n)([-*]) (.+)/g, function (_, p, __, item) {
      return p + '<li>' + item + '</li>';
    });
    html = html.replace(/(<li>[\s\S]+?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    // numbered lists (loose)
    html = html.replace(/(^|\n)(\d+)\. (.+)/g, function (_, p, __, item) {
      return p + '<li>' + item + '</li>';
    });
    // paragraphs
    html = html.split(/\n{2,}/).map(function (chunk) {
      if (/^<(ul|ol|pre|blockquote|h\d)/.test(chunk.trim())) return chunk;
      return '<p>' + chunk.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return html;
  }

  function scrollToBottom() {
    if ($thread) $thread.scrollTop = $thread.scrollHeight;
  }

  function ensureChatContainer() {
    if ($empty) $empty.style.display = 'none';
    if (!document.getElementById('chatList')) {
      var list = document.createElement('div');
      list.id = 'chatList';
      list.className = 'chat-thread';
      $thread.appendChild(list);
    }
    return document.getElementById('chatList');
  }

  function clearChat() {
    var list = document.getElementById('chatList');
    if (list) list.remove();
    if ($empty) $empty.style.display = '';
  }

  // ---------- rendering ----------
  function renderMessage(msg) {
    var list = ensureChatContainer();
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (msg.role === 'user' ? 'user' : 'assistant');

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = msg.role === 'user'
      ? '<i class="bi bi-person-fill"></i>'
      : '<i class="bi bi-stars"></i>';

    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = renderMarkdown(msg.content || '');

    if (msg.actionJson) {
      try {
        var action = typeof msg.actionJson === 'string' ? JSON.parse(msg.actionJson) : msg.actionJson;
        if (action && action.url && action.label) {
          var btn = document.createElement('a');
          btn.className = 'action-btn';
          btn.href = action.url;
          btn.target = action.target || '_self';
          btn.innerHTML = '<i class="bi bi-arrow-right-circle"></i> ' + escapeHtml(action.label);
          bubble.appendChild(btn);
        }
      } catch (_) { /* ignore */ }
    }

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    list.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function renderTyping() {
    var list = ensureChatContainer();
    var wrap = document.createElement('div');
    wrap.className = 'msg assistant typing';
    wrap.innerHTML = '<div class="avatar"><i class="bi bi-stars"></i></div>'
      + '<div class="bubble"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
    list.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  // ---------- API ----------
  function api(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      }).catch(function () {
        return { ok: r.ok, status: r.status, data: null };
      });
    });
  }

  // ---------- send ----------
  function send(promptOverride) {
    if (state.sending) return;
    var content = (promptOverride != null ? promptOverride : ($input ? $input.value : '')).trim();
    if (!content) return;
    state.sending = true;
    if ($sendBtn) $sendBtn.disabled = true;

    if ($input && promptOverride == null) {
      $input.value = '';
      $input.style.height = '';
    }

    renderMessage({ role: 'user', content: content });
    var $typing = renderTyping();

    var threadId = state.currentThreadId || 'new';
    api('POST', '/api/conversations/' + encodeURIComponent(threadId) + '/messages', { content: content })
      .then(function (res) {
        if ($typing && $typing.parentNode) $typing.parentNode.removeChild($typing);

        if (res.status === 402 && res.data && res.data.quotaExceeded) {
          renderMessage({
            role: 'assistant',
            content: '**You\'ve hit your monthly AI limit.** ' + (res.data.error || '') + '\n\nUpgrade your plan to keep talking to your data.',
            actionJson: { url: res.data.upgradeUrl || '/billing', label: 'View plans' },
          });
          return;
        }

        if (!res.ok || !res.data) {
          renderMessage({
            role: 'assistant',
            content: '⚠️ ' + ((res.data && res.data.error) || 'Something went wrong. Please try again.'),
          });
          return;
        }

        var data = res.data;
        if (data.thread && data.thread.id) {
          var isNew = !state.currentThreadId;
          state.currentThreadId = data.thread.id;
          if (isNew) {
            addThreadToSidebar(data.thread);
          } else {
            updateThreadInSidebar(data.thread);
          }
          highlightActiveThread();
          if ($subtitle) $subtitle.textContent = data.thread.title || 'Conversation';
        }

        var asst = data.assistantMessage || data.assistant;
        if (asst) {
          renderMessage({
            role: 'assistant',
            content: asst.content,
            actionJson: asst.actionJson,
          });
        }
      })
      .catch(function (err) {
        if ($typing && $typing.parentNode) $typing.parentNode.removeChild($typing);
        renderMessage({ role: 'assistant', content: '⚠️ Network error: ' + (err && err.message ? err.message : 'unknown') });
      })
      .then(function () {
        state.sending = false;
        if ($sendBtn) $sendBtn.disabled = false;
        if ($input) $input.focus();
      });
  }

  // ---------- threads ----------
  function loadThread(id) {
    if (!id) return newThread();
    api('GET', '/api/conversations/' + encodeURIComponent(id)).then(function (res) {
      if (!res.ok || !res.data) return;
      state.currentThreadId = id;
      clearChat();
      var msgs = (res.data.messages || []);
      msgs.forEach(function (m) {
        renderMessage({ role: m.role, content: m.content, actionJson: m.actionJson });
      });
      if (res.data.thread && $subtitle) $subtitle.textContent = res.data.thread.title || 'Conversation';
      highlightActiveThread();
    });
  }

  function newThread() {
    state.currentThreadId = null;
    clearChat();
    if ($subtitle) $subtitle.textContent = 'Talk to your data';
    highlightActiveThread();
    if ($input) $input.focus();
  }

  function addThreadToSidebar(thread) {
    if (!$sessions || !thread) return;
    // Remove empty-state if present
    var empties = $sessions.querySelectorAll('.empty-state');
    empties.forEach(function (n) { n.remove(); });

    var existing = $sessions.querySelector('.session-item[data-thread-id="' + thread.id + '"]');
    if (existing) {
      var t = existing.querySelector('.session-title');
      if (t) { t.textContent = thread.title; t.title = thread.title; }
      $sessions.insertBefore(existing, $sessions.firstChild);
      return;
    }

    var item = document.createElement('div');
    item.className = 'session-item';
    item.setAttribute('data-thread-id', thread.id);
    item.innerHTML =
      '<span class="session-title" title="' + escapeHtml(thread.title) + '">' + escapeHtml(thread.title) + '</span>' +
      '<span class="session-actions">' +
        '<button class="rename-btn" title="Rename"><i class="bi bi-pencil"></i></button>' +
        '<button class="delete-btn" title="Delete"><i class="bi bi-trash"></i></button>' +
      '</span>';
    $sessions.insertBefore(item, $sessions.firstChild);
    bindSessionItem(item);
  }

  function updateThreadInSidebar(thread) {
    if (!$sessions || !thread) return;
    var existing = $sessions.querySelector('.session-item[data-thread-id="' + thread.id + '"]');
    if (!existing) return addThreadToSidebar(thread);
    var t = existing.querySelector('.session-title');
    if (t) { t.textContent = thread.title; t.title = thread.title; }
    if ($sessions.firstChild !== existing) {
      $sessions.insertBefore(existing, $sessions.firstChild);
    }
  }

  function highlightActiveThread() {
    if (!$sessions) return;
    $sessions.querySelectorAll('.session-item').forEach(function (n) {
      if (String(n.getAttribute('data-thread-id')) === String(state.currentThreadId)) {
        n.classList.add('active');
      } else {
        n.classList.remove('active');
      }
    });
  }

  function renameThread(id, btn) {
    var item = btn.closest('.session-item');
    var current = item ? (item.querySelector('.session-title') || {}).textContent : '';
    var next = window.prompt('Rename conversation', current || '');
    if (next == null) return;
    next = next.trim();
    if (!next) return;
    api('PATCH', '/api/conversations/' + encodeURIComponent(id), { title: next }).then(function (res) {
      if (res.ok && res.data && res.data.thread) updateThreadInSidebar(res.data.thread);
    });
  }

  function deleteThread(id, btn) {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    api('DELETE', '/api/conversations/' + encodeURIComponent(id)).then(function (res) {
      if (!res.ok) return;
      var item = btn.closest('.session-item');
      if (item) item.remove();
      if (String(state.currentThreadId) === String(id)) newThread();
    });
  }

  // ---------- bindings ----------
  function bindSessionItem(item) {
    item.addEventListener('click', function (e) {
      var id = item.getAttribute('data-thread-id');
      if (e.target.closest('.rename-btn')) {
        e.stopPropagation();
        return renameThread(id, e.target.closest('.rename-btn'));
      }
      if (e.target.closest('.delete-btn')) {
        e.stopPropagation();
        return deleteThread(id, e.target.closest('.delete-btn'));
      }
      loadThread(id);
    });
  }

  function bindAll() {
    if ($sessions) {
      $sessions.querySelectorAll('.session-item').forEach(bindSessionItem);
    }
    if ($newBtn) $newBtn.addEventListener('click', newThread);
    document.querySelectorAll('.starter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var p = chip.getAttribute('data-prompt') || chip.textContent;
        if ($input) $input.value = p;
        send();
      });
    });
    if ($input) {
      $input.addEventListener('input', function () {
        $input.style.height = 'auto';
        $input.style.height = Math.min($input.scrollHeight, 180) + 'px';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', bindAll);
  if (document.readyState !== 'loading') bindAll();

  window.AskAI = {
    send: send,
    loadThread: loadThread,
    newThread: newThread,
  };
})();
