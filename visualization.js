/**
 * visualization.js
 * Canvas-based 2D room simulation for the Karpfen Robot Demo.
 *
 * Exposes globals used by the main app script:
 *   worldModel       – parsed model object, null until initWorldModel() is called
 *   robot            – { x, y, dx, dy, radius }  mutable robot state
 *   obstacles        – mutable array of obstacle states
 *   initWorldModel(parsed)  – initialise from a parseKmodel() result
 *   updateObstaclePosition(posObjectId, x, y) – update an obstacle's position
 *   scheduleRedraw() – request an animation-frame redraw
 */
'use strict';

// ── World model – null until kmodel is parsed and initWorldModel() is called ─
let worldModel = null;

// ── Mutable robot state (reset by initWorldModel, updated by WS callbacks) ───
const robot = { x: 0, y: 0, dx: 0, dy: 1, radius: 0.3 };

// ── Mutable obstacle list (reset by initWorldModel, updated by WS callbacks) ─
let obstacles = [];

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('sim-canvas');
const ctx    = canvas.getContext('2d');
const PAD    = 28;  // pixel padding inside canvas on each side

let rafPending = false;

// ── Coordinate transform ─────────────────────────────────────────────────────
// World coords (x right, y up) → canvas pixels (x right, y down).
// roomPxH is the pixel height of the room rectangle (passed from draw context).
function w2c(wx, wy, scale, roomPxH) {
    return [PAD + wx * scale, PAD + roomPxH - wy * scale];
}

// ── Initialise world from parsed kmodel ──────────────────────────────────────
function initWorldModel(parsed) {
    worldModel    = parsed;
    robot.x       = parsed.robot.x;
    robot.y       = parsed.robot.y;
    robot.dx      = parsed.robot.dx;
    robot.dy      = parsed.robot.dy;
    robot.radius  = parsed.robot.radius;
    // Deep-copy so caller mutations don't affect our live state
    obstacles     = parsed.obstacles.map(o => Object.assign({}, o));
    scheduleRedraw();
}

// ── Update an obstacle position by its position-vector object ID ──────────────
function updateObstaclePosition(posObjectId, x, y) {
    const obs = obstacles.find(o => o.positionObjectId === posObjectId);
    if (!obs) return false;
    if (!isNaN(x)) obs.x = x;
    if (!isNaN(y)) obs.y = y;
    return true;
}

// ── Main draw ────────────────────────────────────────────────────────────────
function draw() {
    if (!canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!worldModel) {
        drawPlaceholder();
        return;
    }

    const roomW   = worldModel.roomWidth;
    const roomH   = worldModel.roomHeight;
    // Uniform scale so obstacles and robot don't appear stretched
    const scale   = Math.min(
        (canvas.width  - 2 * PAD) / roomW,
        (canvas.height - 2 * PAD) / roomH
    );
    const roomPxW = roomW * scale;
    const roomPxH = roomH * scale;

    const [rx, ry] = w2c(0, roomH, scale, roomPxH);

    // Floor fill
    ctx.fillStyle = '#F8FFF0';
    ctx.fillRect(rx, ry, roomPxW, roomPxH);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.04)';
    ctx.lineWidth   = 1;
    for (let i = 1; i < roomW; i++) {
        const gx = rx + i * scale;
        ctx.beginPath(); ctx.moveTo(gx, ry); ctx.lineTo(gx, ry + roomPxH); ctx.stroke();
    }
    for (let j = 1; j < roomH; j++) {
        const gy = ry + j * scale;
        ctx.beginPath(); ctx.moveTo(rx, gy); ctx.lineTo(rx + roomPxW, gy); ctx.stroke();
    }

    // Room border walls
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.strokeRect(rx, ry, roomPxW, roomPxH);

    // Cardinal direction labels
    ctx.fillStyle    = '#78909C';
    ctx.font         = `bold ${Math.max(9, scale * 0.35)}px Roboto, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', rx + roomPxW / 2, ry - 13);
    ctx.fillText('S', rx + roomPxW / 2, ry + roomPxH + 13);
    ctx.fillText('W', rx - 13,          ry + roomPxH / 2);
    ctx.fillText('E', rx + roomPxW + 13, ry + roomPxH / 2);

    // Obstacles
    for (const obs of obstacles) {
        drawObstacle(obs, scale, roomPxH);
    }

    // Robot
    drawRobot(scale, roomPxH);
}

// ── Placeholder rendered before any model is loaded ──────────────────────────
function drawPlaceholder() {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#F8F9FA';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = '#B0BEC5';
    ctx.lineWidth   = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.setLineDash([]);
    ctx.restore();

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#90A4AE';
    ctx.font         = `500 ${Math.max(12, Math.min(16, w * 0.04))}px Roboto, sans-serif`;
    ctx.fillText('No world model loaded', w / 2, h / 2 - 16);
    ctx.fillStyle = '#B0BEC5';
    ctx.font      = `${Math.max(10, Math.min(13, w * 0.03))}px Roboto, sans-serif`;
    ctx.fillText('Upload a .kmodel file in Step\u202F3 to visualise the room', w / 2, h / 2 + 14);
}

// ── Obstacle rendering ───────────────────────────────────────────────────────
function drawObstacle(obs, scale, roomPxH) {
    const [cx, cy] = w2c(obs.x, obs.y, scale, roomPxH);
    const r = obs.radius * scale;

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

    // Label (obstacle ID)
    ctx.fillStyle    = '#fff';
    ctx.font         = `bold ${Math.max(9, r * 0.38)}px Roboto, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obs.id, cx, cy);
}

// ── Robot rendering ──────────────────────────────────────────────────────────
function drawRobot(scale, roomPxH) {
    const [cx, cy] = w2c(robot.x, robot.y, scale, roomPxH);
    const r        = robot.radius * scale;

    // Direction arrow (0.9 m long from centre)
    // World: dx right, dy up → canvas: dx right, dy down (invert y)
    const arrowLen = 0.9 * scale;
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
