// OneBot connection settings for qq-bridge (NeroNet adaptation).
//
// Preferred, neutral form in config.json:
//   "onebot": {
//     "provider": "neronet",              // informational
//     "wsUrl": "ws://127.0.0.1:3001",     // forward WebSocket (events + actions)
//     "httpUrl": "http://127.0.0.1:3000", // HTTP API (media sends, MCP tools)
//     "wsAccessToken": "...",             // token of the WebSocket endpoint
//     "httpAccessToken": "...",           // token of the HTTP endpoint (may differ)
//     "mediaProxy": "http://127.0.0.1:7890" // optional: HTTP proxy for QQ media downloads
//                                         // (stickers); only for machines without direct
//                                         // DNS/internet. "mediaProxyHosts": [...] replaces
//                                         // the built-in list of QQ media host suffixes.
//     "ignoreSlashCommands": true        // optional: leave every "/..." message to another
//                                         // OneBot client (AstrBot); default false
//   }
// With an `onebot` section the bridge uses exactly these endpoints and tokens:
// no directory scanning, no endpoint following, no token write-back.
//
// Only explicit OneBot settings are accepted.
export function resolveOneBotSection(file) {
  const onebot = file?.onebot && typeof file.onebot === 'object' && !Array.isArray(file.onebot) ? file.onebot : null;
  if (!onebot) throw new Error('Configure the onebot section with Connect-QQBridge before starting');
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const shared = str(onebot.accessToken);
  return {
    neutral: true,
    provider: str(onebot.provider) || 'onebot',
    wsUrl: str(onebot.wsUrl) || 'ws://127.0.0.1:3001',
    httpUrl: (str(onebot.httpUrl) || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    // upstream code uses `accessToken` for HTTP calls
    accessToken: str(onebot.httpAccessToken) || shared,
    wsAccessToken: str(onebot.wsAccessToken) || shared,
    followDiscoveredEndpoint: false,
    homeDir: '',
    launcherPath: '',
    silenceWarnMs: Number.isFinite(onebot.silenceWarnMs) ? onebot.silenceWarnMs : 600000,
    // coexistence with another OneBot client on the same account: messages starting with "/" are
    // left to it (see docs: AstrBot handles commands, the bridge handles chat)
    ignoreSlashCommands: onebot.ignoreSlashCommands === true,
    // see src/safe-fetch.js (configureMediaProxy); validated there
    mediaProxy: str(onebot.mediaProxy),
    mediaProxyHosts: Array.isArray(onebot.mediaProxyHosts) ? onebot.mediaProxyHosts.filter((h) => typeof h === 'string') : []
  };
}
