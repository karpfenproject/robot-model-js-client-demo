/**
 * kmodel-parser.js
 * Parses a .kmodel file (Karpfen DSL) and extracts world information
 * based on the fixed cleaning_robot.kmeta metamodel structure.
 *
 * Exposes: window.parseKmodel(text)
 *
 * Returns:
 *   {
 *     roomId:    string,
 *     roomWidth: number,
 *     roomHeight: number,
 *     robot: {
 *       id:                string,
 *       positionObjectId:  string,   // object ID of the robot's position Vector
 *       directionObjectId: string,   // object ID of the robot's direction Vector
 *       x:  number, y:  number,      // initial position
 *       dx: number, dy: number,      // initial direction
 *       radius: number,
 *     },
 *     obstacles: [{
 *       id:               string,
 *       positionObjectId: string,    // object ID of the obstacle's position Vector
 *       x: number, y: number,
 *       radius: number,
 *       color:  string,
 *     }]
 *   }
 */
(function (global) {
    'use strict';

    // ----------------------------------------------------------------- Tokenizer
    function tokenize(text) {
        // Strip line comments
        const cleaned = text.replace(/\/\/[^\n]*/g, '');

        const tokens = [];
        // Match: quoted strings | arrow '->' | words | punctuation {}():
        const re = /"([^"]*)"|->|([A-Za-z_]\w*)|([\{\}\(\):])/g;
        let m;
        while ((m = re.exec(cleaned)) !== null) {
            if (m[1] !== undefined)      tokens.push({ t: 'str',   v: m[1] });
            else if (m[0] === '->')      tokens.push({ t: 'arrow'          });
            else if (m[2])               tokens.push({ t: 'word',  v: m[2] });
            else                         tokens.push({ t: 'punct', v: m[3] });
        }
        return tokens;
    }

    // ----------------------------------------------------------------- Parser
    function buildObjectTree(tokens) {
        let pos = 0;
        const objects = {};

        function peek()  { return tokens[pos]; }
        function consume() { return tokens[pos++]; }

        function eat(type, val) {
            const t = consume();
            if (!t || t.t !== type || (val !== undefined && t.v !== val)) {
                throw new Error(
                    `Expected ${type}${val !== undefined ? ':' + val : ''}, ` +
                    `got ${t ? t.t + ':' + t.v : 'EOF'}`
                );
            }
            return t;
        }

        function parseObj() {
            eat('word', 'make');
            eat('word', 'object');
            const id   = eat('str').v;
            eat('punct', ':');
            const type = eat('str').v;
            eat('punct', '{');

            const obj = { id, type, props: {}, children: {}, refs: {} };
            objects[id] = obj;

            while (pos < tokens.length && !(peek().t === 'punct' && peek().v === '}')) {
                const kw = consume().v; // 'prop', 'has', or 'knows'
                eat('punct', '(');
                const name = eat('str').v;
                eat('punct', ')');
                eat('arrow');

                if (kw === 'prop') {
                    obj.props[name] = eat('str').v;
                } else if (kw === 'has' || kw === 'knows') {
                    if (peek() && peek().t === 'word' && peek().v === 'make') {
                        const child = parseObj();
                        if (!obj.children[name]) obj.children[name] = [];
                        obj.children[name].push(child.id);
                    } else {
                        const refId = eat('str').v;
                        if (!obj.refs[name]) obj.refs[name] = [];
                        obj.refs[name].push(refId);
                    }
                }
            }

            eat('punct', '}');
            return obj;
        }

        const root = parseObj();
        return { root, objects };
    }

    // ----------------------------------------------------------------- Public API
    const OBSTACLE_COLORS = [
        '#90A4AE', '#546E7A', '#78909C', '#607D8B',
        '#455A64', '#37474F', '#80CBC4', '#B0BEC5',
    ];

    function parseKmodel(text) {
        let root, objects;
        try {
            ({ root, objects } = buildObjectTree(tokenize(text)));
        } catch (e) {
            throw new Error('Failed to parse .kmodel file: ' + e.message);
        }

        // ── Robot ──────────────────────────────────────────────────────────────
        const robotId  = (root.children['robot'] || [])[0];
        if (!robotId) throw new Error('No element of type Robot found in model (has("robot") missing).');
        const robotObj = objects[robotId];

        const robotBbId = (robotObj.children['boundingBox'] || [])[0];
        const robotBb   = objects[robotBbId];
        const robotDiam = parseFloat(robotBb?.props['diameter'] || '0.6');

        const robotPosId = (robotBb?.children['position'] || [])[0];
        const robotPos   = objects[robotPosId];
        const robotX     = parseFloat(robotPos?.props['x'] || '0');
        const robotY     = parseFloat(robotPos?.props['y'] || '0');

        const robotDirId = (robotObj.children['direction'] || [])[0];
        const robotDir   = objects[robotDirId];
        const robotDx    = parseFloat(robotDir?.props['x'] || '0');
        const robotDy    = parseFloat(robotDir?.props['y'] || '1');

        // ── Obstacles ──────────────────────────────────────────────────────────
        const obstacleIds = root.children['obstacles'] || [];
        const obstacles = obstacleIds.map((obsId, idx) => {
            const obsObj  = objects[obsId];
            const obsBbId = (obsObj?.children['boundingBox'] || [])[0];
            const obsBb   = objects[obsBbId];
            const obsDiam = parseFloat(obsBb?.props['diameter'] || '1.0');
            const obsPosId = (obsBb?.children['position'] || [])[0];
            const obsPos   = objects[obsPosId];
            return {
                id:               obsId,
                positionObjectId: obsPosId,
                x:      parseFloat(obsPos?.props['x'] || '0'),
                y:      parseFloat(obsPos?.props['y'] || '0'),
                radius: obsDiam / 2,
                color:  OBSTACLE_COLORS[idx % OBSTACLE_COLORS.length],
            };
        });

        // ── Room size from wall positions ──────────────────────────────────────
        // Walls define axis-aligned infinite lines.  The 'p' point on each wall
        // gives the maximum coordinate for the opposite axis, so the maximum x
        // across all wall p-vectors gives the room width, and max y the height.
        const wallIds = root.children['walls'] || [];
        let maxX = 0, maxY = 0;
        for (const wallId of wallIds) {
            const wallObj = objects[wallId];
            const pId     = (wallObj?.children['p'] || [])[0];
            const pObj    = objects[pId];
            if (pObj) {
                maxX = Math.max(maxX, parseFloat(pObj.props['x'] || '0'));
                maxY = Math.max(maxY, parseFloat(pObj.props['y'] || '0'));
            }
        }
        const roomWidth  = maxX > 0 ? maxX : 10;
        const roomHeight = maxY > 0 ? maxY : 10;

        return {
            roomId:    root.id,
            roomWidth,
            roomHeight,
            robot: {
                id:                robotId,
                positionObjectId:  robotPosId,
                directionObjectId: robotDirId,
                x:  robotX,
                y:  robotY,
                dx: robotDx,
                dy: robotDy,
                radius: robotDiam / 2,
            },
            obstacles,
        };
    }

    global.parseKmodel = parseKmodel;

})(window);
