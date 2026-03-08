/**
 * connector.js
 * Karpfen Runtime JS client – all networking and communication logic for the demo.
 *
 * Exposes window.KarpfenConnector with the following API:
 *   setCallbacks(cbs)         – register UI event handlers
 *   checkHealth()             – Promise<boolean>
 *   createEnvironment()       – Promise<string>  (envKey)
 *   setMetamodel(content)     – Promise<void>
 *   setModel(content)         – Promise<void>
 *   setStateMachine(content, attachedTo)
 *                             – Promise<string>  (accessKey, auto-registers observers)
 *   connectWebSocket()        – Promise<void>
 *   runAndStart()             – Promise<void>    (runEnvironment + startEnvironment)
 *   triggerStartEvent()       – void             (sends "start" event via WebSocket)
 *   killEngine()              – Promise<void>
 *   getEnvKey()               – string | null
 *   getAccessKey()            – string | null
 *   getClientId()             – string
 */
(function (global) {
    'use strict';

    // ---------------------------------------------------------- Configuration
    const BASE_URL = 'http://localhost:8080';
    const WS_URL   = 'ws://localhost:8080/ws';

    // Unique client ID for this browser session
    const CLIENT_ID = 'demo-' + Date.now() + '-' + Math.floor(Math.random() * 9999);

    // ---------------------------------------------------------- Internal state
    let _envKey    = null;
    let _accessKey = null;
    let _ws        = null;

    // UI callbacks – populated via setCallbacks()
    const _cbs = {
        onObjectChanged : null,  // fn(payload)   – objectChanged message received
        onDomainEvent   : null,  // fn(payload)   – domainEvent message received
        onWsOpen        : null,  // fn(info)       – WebSocket connected and authenticated
        onWsClose       : null,  // fn({code, reason})
        onWsError       : null,  // fn()
        onLogEntry      : null,  // fn({type, msg, timestamp}) – any raw WS message
    };

    function _emit(name, data) {
        if (typeof _cbs[name] === 'function') {
            try { _cbs[name](data); } catch (e) { console.error('[KarpfenConnector] Callback error:', e); }
        }
    }

    // ---------------------------------------------------------- Public API

    /**
     * Register UI callbacks. Keys: onObjectChanged, onDomainEvent, onWsOpen,
     * onWsClose, onWsError, onLogEntry.
     */
    function setCallbacks(cbs) {
        Object.assign(_cbs, cbs);
    }

    /** Ping the server health endpoint. Returns true if server is reachable. */
    async function checkHealth() {
        try {
            const res  = await fetch(`${BASE_URL}/health`);
            if (!res.ok) return false;
            const data = await res.json();
            return data.status === 'ok';
        } catch {
            return false;
        }
    }

    /** Create a new execution environment. Returns the environment key. */
    async function createEnvironment() {
        const res = await fetch(`${BASE_URL}/createEnvironment`, { method: 'POST' });
        await _assertOk(res, 'Create environment');
        _envKey = (await res.text()).trim();
        return _envKey;
    }

    /** Upload the metamodel (.kmeta) content to the current environment. */
    async function setMetamodel(content) {
        _requireEnvKey();
        const res = await fetch(
            `${BASE_URL}/setMetamodel?envKey=${_enc(_envKey)}`,
            { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: content }
        );
        await _assertOk(res, 'Set metamodel');
    }

    /** Upload the model (.kmodel) content to the current environment. */
    async function setModel(content) {
        _requireEnvKey();
        const res = await fetch(
            `${BASE_URL}/setModel?envKey=${_enc(_envKey)}`,
            { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: content }
        );
        await _assertOk(res, 'Set model');
    }

    /**
     * Upload the statemachine (.kstates) content, attach it to `attachedTo` (default: "turtle"),
     * then automatically register the WebSocket client and subscribe to turtle's position
     * and direction vectors plus the "public" domain event channel.
     * Returns the WebSocket access key.
     */
    async function setStateMachine(content, attachedTo) {
        _requireEnvKey();
        const res = await fetch(
            `${BASE_URL}/setStateMachine?envKey=${_enc(_envKey)}&attachedTo=${_enc(attachedTo)}`,
            { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: content }
        );
        await _assertOk(res, 'Set statemachine');

        // Automatically register client and all observers for the demo model
        await _autoRegisterObservers();
        return _accessKey;
    }

    /**
     * Establish and authenticate the WebSocket connection.
     * Resolves once the connection is open and credentials have been sent.
     * Rejects if the connection fails or the server closes it immediately.
     */
    function connectWebSocket() {
        return new Promise((resolve, reject) => {
            if (!_envKey)    return reject(new Error('No environment. Complete setup first.'));
            if (!_accessKey) return reject(new Error('Not registered. Upload the statemachine first.'));

            _ws = new WebSocket(WS_URL);
            let settled = false;

            _ws.onopen = () => {
                // Send authentication as the very first message
                _ws.send(`${CLIENT_ID}:${_envKey}:${_accessKey}`);

                // Resolve after a short grace period — server closes immediately on bad credentials
                setTimeout(() => {
                    if (!settled && _ws && _ws.readyState === WebSocket.OPEN) {
                        settled = true;
                        _emit('onWsOpen', { clientId: CLIENT_ID, envKey: _envKey });
                        resolve();
                    }
                }, 400);
            };

            _ws.onmessage = (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    _emit('onLogEntry', { type: 'raw', raw: event.data, timestamp: Date.now() });
                    return;
                }

                _emit('onLogEntry', { type: msg.messageType, msg, timestamp: Date.now() });

                if (msg.messageType === 'objectChanged') {
                    _emit('onObjectChanged', msg.payload);
                } else if (msg.messageType === 'domainEvent') {
                    _emit('onDomainEvent', msg.payload);
                }
            };

            _ws.onclose = (e) => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`WebSocket closed before ready (${e.code}: ${e.reason || 'unknown'})`));
                }
                _emit('onWsClose', { code: e.code, reason: e.reason });
            };

            _ws.onerror = () => {
                if (!settled) {
                    settled = true;
                    reject(new Error('WebSocket connection error. Is the server running?'));
                }
                _emit('onWsError', {});
            };
        });
    }

    /**
     * Activate (runEnvironment) then start (startEnvironment) the execution engine.
     * runEnvironment must be called before startEnvironment.
     */
    async function runAndStart() {
        _requireEnvKey();

        const r1 = await fetch(`${BASE_URL}/runEnvironment?envKey=${_enc(_envKey)}`, { method: 'POST' });
        await _assertOk(r1, 'Run environment');

        const r2 = await fetch(`${BASE_URL}/startEnvironment?envKey=${_enc(_envKey)}`, { method: 'POST' });
        await _assertOk(r2, 'Start environment');
    }

    /**
     * Send the initial "start" event via WebSocket to move the statemachine
     * from the "ready" state into its main execution loop.
     * Requires an open WebSocket connection.
     */
    function triggerStartEvent() {
        if (!_ws || _ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket is not connected. Connect first.');
        }
        // The statemachine listens for EVENT("public", "start").
        // The server maps message.environmentKey → event.domain and message.messageType → event.name.
        _ws.send(JSON.stringify({
            environmentKey: 'public',
            messageType:    'start',
            payload:        ''
        }));
    }

    /** Stop the execution engine and close all WebSocket connections. */
    async function killEngine() {
        _requireEnvKey();
        const res = await fetch(`${BASE_URL}/stopEnvironment?envKey=${_enc(_envKey)}`, { method: 'POST' });
        await _assertOk(res, 'Stop environment');
    }

    // ---------------------------------------------------------- Private helpers

    async function _autoRegisterObservers() {
        // 1. Obtain a WebSocket access key for this demo client
        const res = await fetch(
            `${BASE_URL}/registerClientForWebSocket?clientId=${_enc(CLIENT_ID)}&envKey=${_enc(_envKey)}`,
            { method: 'POST' }
        );
        await _assertOk(res, 'Register client for WebSocket');
        _accessKey = (await res.text()).trim();

        // 2. Subscribe to the turtle's position vector (updated each tick by the statemachine)
        await _registerObjectObserver('turtlePosition');

        // 3. Subscribe to the turtle's direction vector (updated when reacting to obstacles/walls)
        await _registerObjectObserver('turtleDirection');

        // 4. Subscribe to the "public" domain to receive statemachine event notifications
        await _registerDomainListener('public');
    }

    async function _registerObjectObserver(objectId) {
        const res = await fetch(
            `${BASE_URL}/registerObjectObserver?envKey=${_enc(_envKey)}&clientId=${_enc(CLIENT_ID)}&objectId=${_enc(objectId)}`,
            { method: 'POST' }
        );
        await _assertOk(res, `Register observer for '${objectId}'`);
    }

    async function _registerDomainListener(domain) {
        const res = await fetch(
            `${BASE_URL}/registerDomainListener?envKey=${_enc(_envKey)}&clientId=${_enc(CLIENT_ID)}&domain=${_enc(domain)}`,
            { method: 'POST' }
        );
        await _assertOk(res, `Register domain listener for '${domain}'`);
    }

    function _requireEnvKey() {
        if (!_envKey) throw new Error('No environment created. Call createEnvironment() first.');
    }

    async function _assertOk(res, label) {
        if (!res.ok) {
            let body = '';
            try { body = await res.text(); } catch { /* ignore */ }
            throw new Error(`${label} failed (HTTP ${res.status})${body ? ': ' + body : ''}`);
        }
    }

    function _enc(v) { return encodeURIComponent(v); }

    // ---------------------------------------------------------- Export
    global.KarpfenConnector = {
        setCallbacks,
        checkHealth,
        createEnvironment,
        setMetamodel,
        setModel,
        setStateMachine,
        connectWebSocket,
        runAndStart,
        triggerStartEvent,
        killEngine,
        getEnvKey:    () => _envKey,
        getAccessKey: () => _accessKey,
        getClientId:  () => CLIENT_ID,
    };

})(window);
