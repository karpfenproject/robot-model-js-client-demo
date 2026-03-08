/**
 * visualization.js
 * Canvas-based 2D room simulation for the Karpfen Robot Demo.
 *
 * Exposes globals used by the main app script:
 *   robot        – { x, y, dx, dy }  mutable robot state
 *   scheduleRedraw() – request an animation-frame redraw
 */
'use strict';

// ── Static world model (mirrors cleaning_robot.kmodel) ──────────────────────
const ROOM_SIZE = 10;   // metres, both axes
const OBSTACLES = [
    { id: 'chair', cx: 2.0, cy: 3.0, r: 0.5,  color: '#90A4AE', label: 'Chair' },
    { id: 'table', cx: 5.0, cy: 7.0, r: 1.5,  color: '#546E7A', label: 'Table' },
];

// ── Mutable robot state (updated by the connector callback in the main script) ─
const robot = { x: 5.0, y: 5.0, dx: 0.0, dy: 1.0 };

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');
const PAD    = 28;  // pixel padding inside canvas on each side

let rafPending = false;

// ── Coordinate transform ─────────────────────────────────────────────────────
/** Convert world coords (x right, y up) to canvas pixels (x right, y down). */
function w2c(wx, wy, scale) {
    return [PAD + wx * scale, canvas.height - PAD - wy * scale];
}

// ── Main draw ────────────────────────────────────────────────────────────────
function draw() {
    if (!canvas.width) return;
    const scale  = (canvas.width - 2 * PAD) / ROOM_SIZE;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const [rx, ry] = w2c(0, ROOM_SIZE, scale);
    const roomPx   = ROOM_SIZE * scale;

    // Floor fill + grid
    ctx.fillStyle = '#F8FFF0';
    ctx.fillRect(rx, ry, roomPx, roomPx);
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < ROOM_SIZE; i++) {
        const gx = rx + i * scale;
        const gy = ry + i * scale;
        ctx.beginPath(); ctx.moveTo(gx, ry); ctx.lineTo(gx, ry + roomPx); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rx, gy); ctx.lineTo(rx + roomPx, gy); ctx.stroke();
    }

    // Room border walls
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.strokeRect(rx, ry, roomPx, roomPx);

    // Cardinal direction labels
    ctx.fillStyle    = '#78909C';
    ctx.font         = `bold ${Math.max(9, scale * 0.35)}px Roboto, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    const mid = rx + roomPx / 2;
    ctx.fillText('N', mid,         ry - 13);
    ctx.fillText('S', mid,         ry + roomPx + 13);
    ctx.fillText('W', rx - 13,     ry + roomPx / 2);
    ctx.fillText('E', rx + roomPx + 13, ry + roomPx / 2);

    // Obstacles
    for (const obs of OBSTACLES) {
        drawObstacle(obs, scale);
    }

    // Robot
    drawRobot(scale);
}

// ── Obstacle rendering ───────────────────────────────────────────────────────
function drawObstacle(obs, scale) {
    const [cx, cy] = w2c(obs.cx, obs.cy, scale);
    const r = obs.r * scale;

    // Drop shadow
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = obs.color;
    ctx.fill();
    ctx.restore();

    // Border
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = shadeColor(obs.color, -30);
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Label
    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.max(9, r * 0.38)}px Roboto, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obs.label, cx, cy);
}

// ── Robot rendering ──────────────────────────────────────────────────────────
function drawRobot(scale) {
    const [cx, cy] = w2c(robot.x, robot.y, scale);
    const r        = 0.1 * scale;  // 0.1 m radius → diameter 0.2 m

    // Direction arrow (0.45 m long from centre)
    // World: dx right, dy up → canvas: dx right, dy down (invert y)
    const arrowLen = 0.45 * scale;
    const toX = cx + robot.dx * arrowLen;
    const toY = cy - robot.dy * arrowLen;
    drawArrow(cx, cy, toX, toY, '#FFD600', Math.max(2, r * 0.4));

    // Glow halo
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.8);
    grad.addColorStop(0, 'rgba(255,109,0,0.25)');
    grad.addColorStop(1, 'rgba(255,109,0,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Body
    ctx.save();
    ctx.shadowColor   = 'rgba(230,74,25,0.5)';
    ctx.shadowBlur    = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#FF6D00';
    ctx.fill();
    ctx.strokeStyle = '#E64A19';
    ctx.lineWidth   = 2;
    ctx.stroke();
    ctx.restore();

    // Centre dot
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, r * 0.25), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
}

// ── Arrow helper ─────────────────────────────────────────────────────────────
function drawArrow(fromX, fromY, toX, toY, color, lineWidth) {
    const angle   = Math.atan2(toY - fromY, toX - fromX);
    const headLen = Math.max(8, lineWidth * 3.5);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - headLen * Math.cos(angle - Math.PI / 6),
        toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - headLen * Math.cos(angle + Math.PI / 6),
        toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ── Colour utility ───────────────────────────────────────────────────────────
/** Darken (negative) or lighten (positive) a CSS hex colour by `amount`. */
function shadeColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r   = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g   = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
    const b   = Math.min(255, Math.max(0, (num & 0xFF) + amount));
    return `rgb(${r},${g},${b})`;
}

// ── Redraw scheduling ────────────────────────────────────────────────────────
function scheduleRedraw() {
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => { draw(); rafPending = false; });
    }
}

// ── Responsive canvas resize ─────────────────────────────────────────────────
function resizeCanvas() {
    const area = document.getElementById('canvas-area');
    const size = Math.min(area.clientWidth - 4, area.clientHeight - 4);
    if (size > 0 && (canvas.width !== size || canvas.height !== size)) {
        canvas.width  = size;
        canvas.height = size;
        draw();
    }
}

const _ro = new ResizeObserver(() => resizeCanvas());
_ro.observe(document.getElementById('canvas-area'));
window.addEventListener('load', () => { resizeCanvas(); draw(); });
