// Neutral OneBot v11 forward-WebSocket client for qq-bridge (NeroNet adaptation).
//
// Independent transport for the NeroNet qq-bridge adaptation; no external SDK
// or postinstall patch is required. It speaks OneBot v11 (forward WebSocket, role
// Universal, `echo` request/response matching) and implements exactly the
// surface src/bridge.js uses:
//   request() -> raw response envelope; call() / raw() -> data or throw
//   OneBotApiError (retcode / wording / response); event subscriptions
//   (onPrivateMessage, onGroupMessage, onNotice, onBotStatus, onEvent, ...);
//   reconnect with backoff; mutable url / accessToken for re-connection.

import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

export class OneBotError extends Error {
  constructor(message, options) { super(message, options); this.name = 'OneBotError'; }
}
export class OneBotConnectionError extends OneBotError {
  constructor(message, options) { super(message, options); this.name = 'OneBotConnectionError'; }
}
export class OneBotTimeoutError extends OneBotError {
  constructor(message, timeoutMs) { super(message); this.name = 'OneBotTimeoutError'; this.timeoutMs = timeoutMs; }
}
export class OneBotApiError extends OneBotError {
  constructor(response) {
    super(response?.wording || response?.message || `OneBot action failed with retcode ${response?.retcode}`);
    this.name = 'OneBotApiError';
    this.response = response;
    this.retcode = response?.retcode;
    this.wording = response?.wording;
  }
}
/** Authentication / authorization failure (retcode 1401 / 401 / 403). */
export class OneBotAuthError extends OneBotApiError {
  constructor(response) { super(response); this.name = 'OneBotAuthError'; }
}
function apiError(response) {
  return [1401, 401, 403].includes(response?.retcode) ? new OneBotAuthError(response) : new OneBotApiError(response);
}

/** Text segment helper (same shape as the SDK's `text()`). */
export function text(value) {
  return { type: 'text', data: { text: String(value ?? '') } };
}
function normalizeMessage(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && typeof input.toSegments === 'function') return input.toSegments();
  return Array.isArray(input) ? input : [input];
}
function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function withAccessToken(urlValue, token) {
  if (!token) return urlValue;
  const url = new URL(urlValue);
  if (!url.searchParams.has('access_token')) url.searchParams.set('access_token', token);
  return url.toString();
}
/** The URL without query or credentials, for messages. */
function displayUrl(urlValue) {
  try { const u = new URL(urlValue); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return '(invalid URL)'; }
}

/**
 * Ask the server why a WebSocket handshake failed. The built-in WebSocket only
 * reports "closed (1006)" and hides the HTTP status, so a wrong access token
 * looks the same as a server that is down. A plain upgrade request shows the
 * status. Resolves { kind: 'http', status } | { kind: 'upgraded' } |
 * { kind: 'network', code } | { kind: 'timeout' } | { kind: 'invalid' }.
 */
export function probeHandshake(urlValue, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlValue); } catch { resolve({ kind: 'invalid' }); return; }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') { resolve({ kind: 'invalid' }); return; }
    const secure = url.protocol === 'wss:';
    const req = (secure ? https : http).request({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (secure ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64')
      }
    });
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    req.on('upgrade', (_res, socket) => { socket.destroy(); done({ kind: 'upgraded' }); });
    req.on('response', (res) => { res.resume(); done({ kind: 'http', status: res.statusCode }); });
    req.on('timeout', () => { done({ kind: 'timeout' }); req.destroy(); });
    req.on('error', (error) => done({ kind: 'network', code: error?.code ?? error?.message ?? 'error' }));
    req.end();
  });
}

/** Turn a handshake probe into the error a failed connect() rejects with. */
export function handshakeError(urlValue, probe) {
  const where = displayUrl(urlValue);
  const make = (code, message, extra = {}) => Object.assign(new OneBotConnectionError(`${code}: ${message}`), { code, ...extra });
  if (probe?.kind === 'http' && (probe.status === 401 || probe.status === 403)) {
    return make('NERONET_ONEBOT_AUTH_REJECTED', // Worded so the bridge log redaction (it masks "token <word>") keeps it readable.
      `${where} rejected the WebSocket handshake (HTTP ${probe.status}): wrong access token; check onebot.wsAccessToken`, { status: probe.status, authRejected: true });
  }
  if (probe?.kind === 'http') {
    return make('NERONET_ONEBOT_HANDSHAKE_FAILED', `${where} answered the WebSocket handshake with HTTP ${probe.status}; check onebot.wsUrl`, { status: probe.status });
  }
  if (probe?.kind === 'network' || probe?.kind === 'timeout') {
    return make('NERONET_ONEBOT_UNREACHABLE', `cannot reach ${where} (${probe.kind === 'timeout' ? 'timeout' : probe.code}); is NeroNet running?`);
  }
  return make('NERONET_ONEBOT_CLOSED_BEFORE_OPEN', `OneBot WebSocket closed before opening (${where})`);
}

function rejectAll(pending, error) {
  for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
  pending.clear();
}

function dropUndefined(params) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) out[k] = v;
  return out;
}

let echoSeq = 0;
function nextEcho() { echoSeq = (echoSeq + 1) % Number.MAX_SAFE_INTEGER; return `neronet-qqbridge:${Date.now().toString(36)}:${echoSeq}`; }

const isMessage = (e) => e?.post_type === 'message';
const isNotice = (e) => e?.post_type === 'notice';

export class OneBotWebSocketClient {
  constructor(options = {}) {
    this.url = options.url ?? 'ws://127.0.0.1:3001/';
    this.accessToken = options.accessToken;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.handshakeProbeTimeoutMs = options.handshakeProbeTimeoutMs ?? 3000;
    this.WebSocketCtor = options.webSocket ?? globalThis.WebSocket;
    if (!this.WebSocketCtor) throw new OneBotConnectionError('No WebSocket implementation is available (Node.js >= 22 required)');
    const rc = options.reconnect;
    this.reconnect = rc ? (rc === true ? {} : rc) : null;
    this.listeners = new Map();
    this.handlers = [];
    // Connection ownership: every socket gets its own record {id, socket, pending, opened}.
    // Only the record in `this.current` may change client state (socket, connect promise,
    // reconnect, events); a superseded socket can only settle its own requests.
    this.current = null;
    this.generation = 0;
    this.connectPromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.closedByUser = false;
  }

  get socket() { return this.current?.socket ?? null; }
  /** Requests waiting for a response on the current connection (kept for diagnostics). */
  get pending() { return this.current?.pending ?? new Map(); }
  get isConnected() { return this.socket?.readyState === 1; }

  // low-level client events: open, close, error, event, raw, response
  on(event, listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(listener);
    return () => this.off(event, listener);
  }
  once(event, listener) {
    const off = this.on(event, (payload) => { off(); listener(payload); });
    return off;
  }
  off(event, listener) { this.listeners.get(event)?.delete(listener); }
  emit(event, payload) {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try { listener(payload); } catch (error) { if (event !== 'error') this.emit('error', error); }
    }
  }

  // event subscriptions (run in registration order, then the 'event' fan-out)
  when(predicate, handler) {
    const entry = { predicate, handler };
    this.handlers.push(entry);
    return () => { const i = this.handlers.indexOf(entry); if (i >= 0) this.handlers.splice(i, 1); };
  }
  onEvent(listener) { return this.on('event', listener); }
  onMessage(handler) { return this.when(isMessage, handler); }
  onPrivateMessage(handler) { return this.when((e) => isMessage(e) && e.message_type === 'private', handler); }
  onGroupMessage(handler) { return this.when((e) => isMessage(e) && e.message_type === 'group', handler); }
  onNotice(typeOrHandler, handler) {
    if (typeof typeOrHandler === 'string') {
      if (!handler) throw new TypeError('onNotice(type, handler) requires a handler');
      return this.when((e) => isNotice(e) && e.notice_type === typeOrHandler, handler);
    }
    return this.when(isNotice, typeOrHandler);
  }
  /** `bot_status` notices; implementations that never send them simply never call the handler. */
  onBotStatus(handler) {
    return this.when((e) => isNotice(e) && e.notice_type === 'bot_status' && (e.sub_type === 'online' || e.sub_type === 'offline'), handler);
  }
  onRequest(typeOrHandler, handler) {
    if (typeof typeOrHandler === 'string') return this.when((e) => e?.post_type === 'request' && e.request_type === typeOrHandler, handler);
    return this.when((e) => e?.post_type === 'request', typeOrHandler);
  }
  onMetaEvent(handler) { return this.when((e) => e?.post_type === 'meta_event', handler); }

  async dispatch(event) {
    for (const { predicate, handler } of [...this.handlers]) {
      if (predicate(event)) await handler(event, { client: this });
    }
    this.emit('event', event);
  }

  /**
   * Opens a connection, or joins the attempt already in progress. The attempt is owned by a
   * connection record; its promise is stored only while that record is current, so a failed
   * or superseded attempt never blocks the next connect().
   */
  connect() {
    if (this.isConnected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.closedByUser = false;
    let socket;
    try {
      socket = new this.WebSocketCtor(withAccessToken(this.url, this.accessToken));
    } catch (error) {
      // Nothing is stored: the next connect() (for example after the URL is corrected) tries again.
      return Promise.reject(new OneBotConnectionError(`OneBot WebSocket URL is invalid: ${error?.message ?? error}`, { cause: error }));
    }
    const conn = { id: ++this.generation, socket, pending: new Map(), opened: false };
    this.current = conn;
    const isCurrent = () => this.current === conn;
    const target = this.url;
    const token = this.accessToken;
    const attempt = new Promise((resolve, reject) => {
      conn.rejectAttempt = reject;
      socket.addEventListener('open', () => {
        if (!isCurrent()) { // superseded (client closed or replaced) before it opened
          try { socket.close(1000, 'superseded'); } catch {}
          reject(new OneBotConnectionError('OneBot WebSocket connection was superseded'));
          return;
        }
        conn.opened = true;
        this.reconnectAttempts = 0;
        this.emit('open', undefined);
        resolve();
      });
      // A superseded socket may still deliver responses to its own requests; its events are dropped.
      socket.addEventListener('message', (message) => this.handleMessage(message?.data, conn));
      // Before the socket opens, an error event carries no usable detail (the
      // built-in WebSocket gives an empty Event); the close handler below reports
      // the diagnosed cause instead. Errors of a superseded socket are not reported.
      socket.addEventListener('error', (error) => { if (conn.opened && isCurrent()) this.emit('error', error?.error ?? error); });
      socket.addEventListener('close', (info) => {
        rejectAll(conn.pending, new OneBotConnectionError('OneBot WebSocket closed'));
        if (!conn.opened) {
          probeHandshake(withAccessToken(target, token), this.handshakeProbeTimeoutMs)
            .then((probe) => reject(handshakeError(target, probe)), () => reject(handshakeError(target, null)));
        }
        if (!isCurrent()) return; // late close of an old socket: the current connection is untouched
        this.current = null;
        this.emit('close', { code: info?.code, reason: info?.reason, wasClean: info?.wasClean });
        if (!this.closedByUser && this.reconnect) this.scheduleReconnect();
      });
    });
    this.connectPromise = attempt;
    const clear = () => { if (this.connectPromise === attempt) this.connectPromise = null; };
    attempt.then(clear, clear);
    return attempt;
  }

  close(code = 1000, reason = 'normal') {
    this.closedByUser = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    const conn = this.current;
    this.current = null;
    this.connectPromise = null;
    if (!conn) return;
    rejectAll(conn.pending, new OneBotConnectionError('OneBot WebSocket client closed'));
    if (!conn.opened) conn.rejectAttempt?.(new OneBotConnectionError('OneBot WebSocket client closed'));
    if (conn.socket.readyState !== 3) { try { conn.socket.close(code, reason); } catch {} }
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.reconnect) return;
    const retries = this.reconnect.retries ?? Number.POSITIVE_INFINITY;
    if (this.reconnectAttempts >= retries) return;
    const minDelay = this.reconnect.minDelayMs ?? 1000;
    const maxDelay = this.reconnect.maxDelayMs ?? 30_000;
    const delay = Math.min(maxDelay, minDelay * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => { this.emit('error', error); });
    }, delay);
  }

  handleMessage(data, conn = this.current) {
    const current = conn === this.current;
    const raw = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : String(data ?? '');
    if (current) this.emit('raw', raw);
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { if (current) this.emit('error', new OneBotError('OneBot WebSocket sent non-JSON data', { cause: error })); return; }
    if (isObject(parsed) && parsed.echo !== undefined && conn) {
      const key = JSON.stringify(parsed.echo);
      const pending = conn.pending.get(key);
      if (pending) {
        conn.pending.delete(key);
        clearTimeout(pending.timer);
        if (parsed.status !== 'ok' && parsed.status !== 'failed') { pending.reject(new OneBotError('OneBot response has no valid status')); return; }
        const response = { ...parsed, retcode: typeof parsed.retcode === 'number' ? parsed.retcode : -1, data: parsed.data ?? null };
        pending.resolve(response);
        this.emit('response', response);
        return;
      }
    }
    // Events only from the current connection: a superseded socket must not inject duplicates.
    if (current && isObject(parsed) && typeof parsed.post_type === 'string') {
      this.dispatch(parsed).catch((error) => this.emit('error', error));
    }
  }

  /** Rejects the requests of the current connection (kept for compatibility). */
  rejectPending(error) { if (this.current) rejectAll(this.current.pending, error); }

  /** Sends one action and returns the raw OneBot response envelope. */
  async request(action, params, options = {}) {
    await this.connect();
    const conn = this.current;
    const socket = conn?.socket;
    if (!socket || socket.readyState !== 1) throw new OneBotConnectionError('OneBot WebSocket is not open');
    const echo = options.echo ?? nextEcho();
    const key = JSON.stringify(echo);
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        conn.pending.delete(key);
        reject(new OneBotTimeoutError(`OneBot request ${action} timed out after ${timeoutMs}ms`, timeoutMs));
      }, timeoutMs) : null;
      conn.pending.set(key, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ action, params: dropUndefined(params), echo }));
      } catch (error) {
        clearTimeout(timer);
        conn.pending.delete(key);
        reject(new OneBotConnectionError('Failed to send OneBot request', { cause: error }));
      }
    });
  }
  /** Sends one action; returns `data`, throws OneBotApiError on a failed response. */
  async call(action, params, options) {
    const response = await this.request(action, params, options);
    if (response.status !== 'ok' || response.retcode !== 0) throw apiError(response);
    return response.data;
  }
  raw(action, params, options) { return this.call(action, params, options); }
  rawResponse(action, params, options) { return this.request(action, params, options); }

  // typed helpers used by qq-bridge
  getLoginInfo(options) { return this.call('get_login_info', {}, options); }
  getStatus(options) { return this.call('get_status', {}, options); }
  sendPrivateMessage(userId, message, options) {
    return this.call('send_private_msg', { user_id: userId, message: normalizeMessage(message), auto_escape: options?.autoEscape }, options);
  }
  sendGroupMessage(groupId, message, options) {
    return this.call('send_group_msg', { group_id: groupId, message: normalizeMessage(message), auto_escape: options?.autoEscape }, options);
  }
  getMessage(messageId, options) { return this.call('get_msg', { message_id: messageId }, options); }
  deleteMessage(messageId, options) { return this.call('delete_msg', { message_id: messageId }, options); }
  getGroupMemberList(groupId, options) { return this.call('get_group_member_list', { group_id: groupId, no_cache: options?.noCache }, options); }
  getGroupMemberInfo(groupId, userId, options) {
    return this.call('get_group_member_info', { group_id: groupId, user_id: userId, no_cache: options?.noCache }, options);
  }
  getImage(params, options) { return this.call('get_image', params, options); }
  getRecord(params, options) { return this.call('get_record', params, options); }
  fetchFaceEntity(faceId, options = {}) { return this.call('fetch_face_entity', { face_id: faceId, refresh: options.refresh ?? false }, options); }
}
