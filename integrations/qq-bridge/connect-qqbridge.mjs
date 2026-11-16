// Connect a NeroNet installation to an adapted qq-bridge in one step.
//
//   node connect-qqbridge.mjs --home <NeroNet data directory>
//        --bridge <qq-bridge directory (adapted with apply-adapter.mjs)>
//        [--uin <bot QQ>] [--stickers] [--check] [--show-token]
//
// NeroNet side: uses the existing loopback HTTP server and forward WebSocket
// server of config/onebot_<QQ>.json (creates `qqbridge-http` / `qqbridge-ws`
// only when there is none); existing endpoints are never changed. Enables the
// `qqbridge` action profile (and `qqbridge-stickers` with --stickers).
// qq-bridge side: writes only the `onebot` section of config.json (creating
// config.json from config.example.json when missing). Every changed file is
// backed up first; running it again changes nothing. Tokens are not printed
// unless --show-token. Restart NeroNet and qq-bridge afterwards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));
const stamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'');

export function parseArgs(argv){
 const out={check:false,showToken:false,stickers:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i],next=()=>{const v=argv[++i];if(v===undefined||v.startsWith('--'))throw Error(`${a} needs a value`);return v;};
  if(a==='--home')out.home=next();else if(a==='--bridge')out.bridge=next();else if(a==='--uin')out.uin=next();
  else if(a==='--check')out.check=true;else if(a==='--show-token')out.showToken=true;else if(a==='--stickers')out.stickers=true;
  else throw Error('Unknown argument '+a);
 }
 if(!out.home)throw Error('--home <NeroNet data directory> is required');
 if(!out.bridge)throw Error('--bridge <qq-bridge directory> is required');
 if(out.uin!==undefined&&!/^\d{5,12}$/.test(out.uin))throw Error('--uin must be a QQ number');
 return out;
}

export function findOneBotConfig(configDir,uin){
 if(!fs.existsSync(configDir))throw Error(`No config directory in ${path.dirname(configDir)}: start NeroNet once with this data directory first`);
 const files=fs.readdirSync(configDir).filter(n=>/^onebot_\d+\.json$/.test(n));
 const pick=uin?files.filter(n=>n===`onebot_${uin}.json`):files;
 if(pick.length===0)throw Error(uin?`config/onebot_${uin}.json not found`:'No config/onebot_<QQ>.json yet: start NeroNet once and log in the bot first');
 if(pick.length>1)throw Error('Several bot accounts found; choose one with --uin: '+files.join(', '));
 return path.join(configDir,pick[0]);
}

/** The bridge directory must be qq-bridge with the NeroNet adaptation applied. */
export function checkBridgeDir(dir){
 const pkgFile=path.join(dir,'package.json');
 if(!fs.existsSync(pkgFile))throw Error(`${dir} is not a qq-bridge directory (no package.json)`);
 const pkg=readJson(pkgFile);
 if(pkg.name!=='qq-bridge')throw Error(`${dir} is not a qq-bridge directory`);
 if(!fs.existsSync(path.join(dir,'NERONET_ADAPTATION.json'))||!fs.existsSync(path.join(dir,'src','onebot-config.js')))
  throw Error(`${dir} has not been adapted: run apply-adapter.mjs on it first (upstream qq-bridge ignores the onebot section)`);
 return pkg;
}

const enabled=s=>s&&s.enabled!==false;
/**
 * The address a local client connects to for a server bound to `host`, or null when the server
 * is not reachable on loopback. No host means NeroNet's default bind (reachable on 127.0.0.1);
 * the wildcard binds 0.0.0.0 / :: are reached on 127.0.0.1 / [::1]. IPv6 comes back bracketed.
 */
export function connectHost(host){
 const h=String(host??'').trim().toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
 if(h===''||h==='0.0.0.0')return '127.0.0.1';
 if(h==='::'||h==='::1')return '[::1]';
 if(h==='localhost')return 'localhost';
 const mapped=h.match(/^::ffff:(127\.\d+\.\d+\.\d+)$/);if(mapped)return mapped[1];
 if(/^127\.\d+\.\d+\.\d+$/.test(h)&&net.isIPv4(h))return h;
 return null;
}
const pathOf=s=>{const p=String(s?.path??'').trim()||'/';return p.startsWith('/')?p:'/'+p;};
/** URL of a server as a local client sees it; throws when it cannot be a valid URL. */
export function serverUrl(scheme,s){
 const host=connectHost(s?.host);if(host===null)throw Error(`server "${s?.name}" is not bound to a loopback address`);
 const url=new URL(`${scheme}://${host}:${Number(s.port)}${pathOf(s)}`);
 if(url.search||url.hash)throw Error(`server "${s?.name}" path must not contain a query or fragment`);
 return url;
}
const reachable=s=>enabled(s)&&Number.isInteger(Number(s.port))&&Number(s.port)>0&&Number(s.port)<65536&&connectHost(s.host)!==null;
const arrayFormat=s=>String(s?.messageFormat??'array')==='array';
/** Why a server cannot serve qq-bridge (null = it can). The bridge needs array messages; its
 *  WebSocket needs events and actions on one connection, which is the Universal role. */
export function unsuitable(kind,s){
 if(!enabled(s))return 'it is disabled';
 if(!reachable(s))return 'it is not reachable on a loopback address with a valid port';
 if(!arrayFormat(s))return `its messageFormat is ${s.messageFormat}; qq-bridge needs array`;
 if(kind==='ws'&&String(s.role??'Universal').toLowerCase()!=='universal')return `its role is ${s.role}; qq-bridge needs Universal (events and actions on one connection)`;
 return null;
}
/**
 * The server qq-bridge will use: the dedicated one, else the default one, else any suitable
 * one. Servers that do not fit are left alone (other clients may use them) and never changed.
 * A dedicated server that exists but does not fit is an error: it is not silently replaced.
 */
function pickServer(kind,list,dedicated,fallback,notes){
 const own=list.find(s=>s?.name===dedicated);
 if(own){const why=unsuitable(kind,own);if(why)throw Error(`NeroNet server "${dedicated}" exists but cannot be used by qq-bridge: ${why}. Fix or remove it, then run this tool again`);return own;}
 const preferred=list.find(s=>s?.name===fallback);
 if(preferred&&!unsuitable(kind,preferred))return preferred;
 const other=list.find(s=>s&&!unsuitable(kind,s));
 if(other)return other;
 for(const s of list)if(enabled(s))notes.push(`note: ${kind==='ws'?'WebSocket':'HTTP'} server "${s?.name}" is left unchanged and not used (${unsuitable(kind,s)})`);
 return null;
}
function freePort(start,taken){let p=start;while(taken.has(p))p++;return p;}

/** Pure planning: returns the new documents and what changed. */
export function plan({onebot,actions,actionsFile,bridgeConfig,stickers}){
 const changes=[];
 const nets=onebot.networks??(onebot.networks={});
 const http=Array.isArray(nets.httpServers)?nets.httpServers:(nets.httpServers=[]);
 const ws=Array.isArray(nets.wsServers)?nets.wsServers:(nets.wsServers=[]);
 const taken=new Set([...http,...ws,...(nets.httpClients??[]),...(nets.wsClients??[])].map(x=>Number(x?.port)).filter(Boolean));
 const notes=[];
 let h=pickServer('http',http,'qqbridge-http','http-default',notes);
 if(!h){h={name:'qqbridge-http',host:'127.0.0.1',port:freePort(3000,taken),path:'/',enableWebSocket:false,accessToken:crypto.randomBytes(24).toString('base64url'),messageFormat:'array',reportSelfMessage:false};taken.add(h.port);http.push(h);changes.push(`NeroNet: added HTTP server "qqbridge-http" on 127.0.0.1:${h.port}`);}
 let w=pickServer('ws',ws,'qqbridge-ws','ws-default',notes);
 if(!w){w={name:'qqbridge-ws',host:'127.0.0.1',port:freePort(3001,taken),path:'/',role:'Universal',accessToken:crypto.randomBytes(24).toString('base64url'),messageFormat:'array',reportSelfMessage:false};taken.add(w.port);ws.push(w);changes.push(`NeroNet: added WebSocket server "qqbridge-ws" on 127.0.0.1:${w.port}`);}
 changes.push(...notes);
 const httpUrl=serverUrl('http',h).toString().replace(/\/$/,'');
 const endpoint={
  provider:'neronet',
  wsUrl:serverUrl('ws',w).toString(),
  httpUrl,
  wsAccessToken:w.accessToken??'',
  httpAccessToken:h.accessToken??''
 };
 // action profiles
 const policy=actions??{};
 if(typeof policy!=='object'||Array.isArray(policy))throw Error(actionsFile+' is not a JSON object');
 const profiles=Array.isArray(policy.profiles)?[...policy.profiles]:[];
 for(const name of stickers?['qqbridge','qqbridge-stickers']:['qqbridge'])if(!profiles.includes(name)){profiles.push(name);changes.push(`NeroNet: enabled the ${name} action profile in ${actionsFile}`);}
 if(profiles.length)policy.profiles=profiles;
 // qq-bridge config.json: only the onebot section
 const cfg=bridgeConfig;
 const before=JSON.stringify(cfg.onebot??null);
 cfg.onebot={...(cfg.onebot&&typeof cfg.onebot==='object'?cfg.onebot:{}),...endpoint};
 if(JSON.stringify(cfg.onebot)!==before)changes.push(`qq-bridge: ${before==='null'?'added':'updated'} the onebot section (WS ${endpoint.wsUrl}, HTTP ${endpoint.httpUrl})`);
 return {onebot,actions:policy,bridgeConfig:cfg,endpoint,changes};
}

export async function portsInUse(endpoint){
 const probe=(host,port)=>new Promise(r=>{const s=net.connect({host,port,timeout:800},()=>{s.destroy();r(true);});s.on('error',()=>r(false));s.on('timeout',()=>{s.destroy();r(false);});});
 const w=new URL(endpoint.wsUrl),h=new URL(endpoint.httpUrl);
 return {ws:await probe(w.hostname,Number(w.port)),http:await probe(h.hostname,Number(h.port))};
}

export function run(opts){
 const home=path.resolve(opts.home),configDir=path.join(home,'config');
 const bridge=path.resolve(opts.bridge);
 checkBridgeDir(bridge);
 const onebotFile=findOneBotConfig(configDir,opts.uin);
 const actionsFile=path.join(configDir,'neronet-actions.json');
 const bridgeFile=path.join(bridge,'config.json'),exampleFile=path.join(bridge,'config.example.json');
 if(!fs.existsSync(bridgeFile)&&!fs.existsSync(exampleFile))throw Error('Neither config.json nor config.example.json in '+bridge);
 const before={
  onebot:fs.readFileSync(onebotFile,'utf8'),
  actions:fs.existsSync(actionsFile)?fs.readFileSync(actionsFile,'utf8'):null,
  bridge:fs.existsSync(bridgeFile)?fs.readFileSync(bridgeFile,'utf8'):null
 };
 const result=plan({
  onebot:readJson(onebotFile),actions:before.actions===null?{}:readJson(actionsFile),actionsFile:path.basename(actionsFile),
  bridgeConfig:before.bridge===null?readJson(exampleFile):readJson(bridgeFile),stickers:opts.stickers
 });
 if(before.bridge===null)result.changes.push('qq-bridge: created config.json from config.example.json (fill in dsh, ownerQQ and allow lists)');
 const writes=[[onebotFile,JSON.stringify(result.onebot,null,2)+'\n',before.onebot],[actionsFile,JSON.stringify(result.actions,null,2)+'\n',before.actions],[bridgeFile,JSON.stringify(result.bridgeConfig,null,2)+'\n',before.bridge]];
 const written=[],backups=[];
 if(!opts.check){
  const tag=stamp();
  for(const [file,text,old] of writes){
   if(old!==null&&JSON.stringify(JSON.parse(old.replace(/^﻿/,'')))===JSON.stringify(JSON.parse(text)))continue;
   if(old!==null){const b=`${file}.bak-qqbridge-${tag}`;fs.copyFileSync(file,b);backups.push(b);}
   fs.writeFileSync(file,text);written.push(file);
  }
 }
 const shown=t=>opts.showToken?t:(t?`(set, ${t.length} chars; --show-token prints it)`:'(none)');
 return {
  check:opts.check,changes:result.changes.length?result.changes:['nothing to change'],written,backups,
  endpoint:{...result.endpoint,wsAccessToken:shown(result.endpoint.wsAccessToken),httpAccessToken:shown(result.endpoint.httpAccessToken)},
  rollback:backups.length?'Stop qq-bridge and NeroNet, copy each *.bak-qqbridge-<time> file back over the file it was taken from, then start them again':'nothing was written',
  next:written.length?['Restart NeroNet (Stop-NeroNet.ps1, then Start-NeroNet.ps1) so it reads the action profile and servers','Start or restart qq-bridge (npm start in its directory)']:[]
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))),null,2));}
 catch(error){console.error('connect-qqbridge: '+error.message);process.exitCode=1;}
}
