/**
 * styles.js
 * DOM/CSS class helpers for the Karpfen Robot Demo.
 * Manages the step wizard state, result chips, and the WebSocket log panel.
 */
'use strict';

// ── Step wizard ─────────────────────────────────────────────────────────────

function activateStep(n) {
    const el = document.getElementById(`step-${n}`);
    if (el) {
        el.classList.remove('disabled', 'done');
        el.classList.add('active');
    }
}

function completeStep(n) {
    const el = document.getElementById(`step-${n}`);
    if (el) {
        el.classList.remove('active');
        el.classList.add('done');
    }
}

function setStepError(n, msg) {
    const el = document.getElementById(`step-${n}`);
    if (el) { el.classList.remove('done'); el.classList.add('active'); }
    appendLog({ type: 'raw', raw: `ERROR step ${n}: ${msg}`, timestamp: Date.now() });
}

function showResult(id, text, type = 'info') {
    const el = document.getElementById(id);
    if (!el) return;
    const span = el.querySelector('span:last-child');
    if (span) span.textContent = text;
    el.classList.remove('hidden', 'success', 'error');
    if (type === 'success') el.classList.add('success');
    if (type === 'error')   el.classList.add('error');
}

// ── WebSocket Log panel ──────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 80;
let logMsgCount = 0;

function appendLog(entry) {
    const body = document.getElementById('log-body');
    logMsgCount++;
    document.getElementById('log-count').textContent = logMsgCount + ' msgs';

    const row = document.createElement('div');
    row.className = 'log-entry';

    const ts      = new Date(entry.timestamp || Date.now());
    const timeStr = ts.toTimeString().slice(0, 8);

    let tagClass = 'tag-raw';
    let content  = entry.raw || '';

    if (entry.type === 'objectChanged') {
        tagClass = 'tag-objectChanged';
        try {
            const p = entry.msg.payload;
            const v = p.value || {};
            if (p.objectId === 'turtlePosition') {
                content = `<span class="hi">position</span>  x=${fmt(v.x)}  y=${fmt(v.y)}`;
            } else if (p.objectId === 'turtleDirection') {
                content = `<span class="hi">direction</span> dx=${fmt(v.x)}  dy=${fmt(v.y)}`;
            } else {
                content = `${p.objectId}: ${JSON.stringify(v)}`;
            }
        } catch { content = JSON.stringify(entry.msg.payload); }

    } else if (entry.type === 'domainEvent') {
        tagClass = 'tag-domainEvent';
        try {
            const p = entry.msg.payload;
            content = typeof p === 'string' ? p : JSON.stringify(p);
        } catch { content = String(entry.msg); }
    }

    row.innerHTML = `
        <span class="log-time">${timeStr}</span>
        <span class="log-tag ${tagClass}">${entry.type || 'raw'}</span>
        <span class="log-text">${content}</span>
    `;
    body.appendChild(row);

    // Trim old entries
    while (body.childElementCount > MAX_LOG_ENTRIES) {
        body.removeChild(body.firstChild);
    }
    // Auto-scroll to bottom
    body.scrollTop = body.scrollHeight;
}

function fmt(n) {
    return (n != null) ? Number(n).toFixed(3) : '?';
}
