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

// The switch that prints the tokens, as the caller knows it (the PowerShell script or this tool).
const showTokenSwitch=()=>process.env.NERONET_TOOL_ENTRY==='powershell'?'-ShowToken':'--show-token';

export function parseArgs(argv){
 const out={check:false,showToken:false,stickers:false};
 for(let i=0;i<argv.length;i++){
  const a=argv[i],next=()=>{const v=argv[++i];if(v===undefined||v.startsWith('--'))throw Error(`${a} 后面需要一个值`);return v;};
  if(a==='--home')out.home=next();else if(a==='--bridge')out.bridge=next();else if(a==='--uin')out.uin=next();
  else if(a==='--check')out.check=true;else if(a==='--show-token')out.showToken=true;else if(a==='--stickers')out.stickers=true;
  else throw Error('不认识的参数 '+a);
 }
 if(!out.home)throw Error('需要用 --home 指定 NeroNet 的数据目录');
 if(!out.bridge)throw Error('--bridge <qq-bridge directory> is required');
 if(out.uin!==undefined&&!/^\d{5,12}$/.test(out.uin))throw Error('--uin must be a QQ number');
 return out;
}

export function findOneBotConfig(configDir,uin){
 if(!fs.existsSync(configDir))throw Error(`${path.dirname(configDir)} 里没有 config 目录：请先用这个数据目录启动一次 NeroNet`);
 const files=fs.readdirSync(configDir).filter(n=>/^onebot_\d+\.json$/.test(n));
 const pick=uin?files.filter(n=>n===`onebot_${uin}.json`):files;
 if(pick.length===0)throw Error(uin?`没有找到 config/onebot_${uin}.json`:'还没有 config/onebot_<QQ>.json：请先登录机器人 QQ 并启动一次 NeroNet');
 if(pick.length>1)throw Error('找到多个机器人账号的配置，请用 --uin 指定其中一个：'+files.join(', '));
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
 if(!enabled(s))return '它没有启用';
 if(!reachable(s))return '它没有绑定在本机地址（127.0.0.1 等）的有效端口上';
 if(!arrayFormat(s))return `它的消息格式是 ${s.messageFormat}，qq-bridge 需要 array`;
 if(kind==='ws'&&String(s.role??'Universal').toLowerCase()!=='universal')return `它的角色是 ${s.role}，qq-bridge 需要 Universal（在同一条连接上收事件和发动作）`;
 return null;
}
/**
 * The server qq-bridge will use: the dedicated one, else the default one, else any suitable
 * one. Servers that do not fit are left alone (other clients may use them) and never changed.
 * A dedicated server that exists but does not fit is an error: it is not silently replaced.
 */
function pickServer(kind,list,dedicated,fallback,notes){
 const own=list.find(s=>s?.name===dedicated);
 if(own){const why=unsuitable(kind,own);if(why)throw Error(`NeroNet 里已有名为 "${dedicated}" 的服务，但 qq-bridge 不能使用它：${why}。请修正或删除它后重新运行`);return own;}
 const preferred=list.find(s=>s?.name===fallback);
 if(preferred&&!unsuitable(kind,preferred))return preferred;
 const other=list.find(s=>s&&!unsuitable(kind,s));
 if(other)return other;
 for(const s of list)if(enabled(s))notes.push(`说明：${kind==='ws'?'WebSocket':'HTTP'} 服务 "${s?.name}" 没有被选用，也没有被修改（${unsuitable(kind,s)}）`);
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
 for(const name of stickers?['qqbridge','qqbridge-stickers']:['qqbridge'])if(!profiles.includes(name)){profiles.push(name);changes.push(`NeroNet：在 ${actionsFile} 中开启了 ${name} 动作档案`);}
 if(profiles.length)policy.profiles=profiles;
 // qq-bridge config.json: only the onebot section
 const cfg=bridgeConfig;
 const before=JSON.stringify(cfg.onebot??null);
 cfg.onebot={...(cfg.onebot&&typeof cfg.onebot==='object'?cfg.onebot:{}),...endpoint};
 if(JSON.stringify(cfg.onebot)!==before)changes.push(`qq-bridge：${before==='null'?'添加':'更新'}了 onebot 段（WS ${endpoint.wsUrl}，HTTP ${endpoint.httpUrl}）`);
 return {onebot,actions:policy,bridgeConfig:cfg,endpoint,changes};
}

/**
 * Pre-check for image recognition. qq-bridge hands a still picture to the model unchanged only
 * when it is at most 1 MiB and its long edge at most 1280 px (its defaults); larger pictures and
 * all animated ones are converted with ffmpeg first. Without ffmpeg those are not shown to the
 * model. ffmpeg is looked up the way qq-bridge does: FFMPEG_PATH, then config.json
 * socialV2.voice.ffmpegPath, then PATH. Nothing is changed here; this only reports.
 */
export function ffmpegCheck(bridgeConfig,env=process.env){
 const configured=env.FFMPEG_PATH||bridgeConfig?.socialV2?.voice?.ffmpegPath||'';
 const names=process.platform==='win32'?['ffmpeg.exe']:['ffmpeg'];
 let found=null,source=null;
 if(configured){if(fs.existsSync(configured)){found=configured;source=env.FFMPEG_PATH?'FFMPEG_PATH':'config.json socialV2.voice.ffmpegPath';}}
 else for(const dir of String(env.PATH??env.Path??'').split(path.delimiter).filter(Boolean)){const hit=names.map(n=>path.join(dir,n)).find(f=>fs.existsSync(f));if(hit){found=hit;source='PATH';break;}}
 if(found)return {ffmpeg:'found',source,note:'已找到 ffmpeg：超过 1 MiB 或长边超过 1280 像素的图片、以及动图，会先转换再交给模型识别'};
 return {ffmpeg:configured?'configured-but-missing':'missing',source:null,
  note:(configured?'配置的 ffmpeg 路径不存在。':'没有找到 ffmpeg。')+'不超过 1 MiB 且长边不超过 1280 像素的静态图片可以直接识别；更大的图片和动图需要 ffmpeg，否则模型看不到图。安装 ffmpeg 后，在启动 qq-bridge 前设置环境变量 FFMPEG_PATH，或在 config.json 的 socialV2.voice.ffmpegPath 中填写 ffmpeg.exe 的完整路径'};
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
 if(!fs.existsSync(bridgeFile)&&!fs.existsSync(exampleFile))throw Error(bridge+' 里既没有 config.json 也没有 config.example.json');
 const before={
  onebot:fs.readFileSync(onebotFile,'utf8'),
  actions:fs.existsSync(actionsFile)?fs.readFileSync(actionsFile,'utf8'):null,
  bridge:fs.existsSync(bridgeFile)?fs.readFileSync(bridgeFile,'utf8'):null
 };
 const result=plan({
  onebot:readJson(onebotFile),actions:before.actions===null?{}:readJson(actionsFile),actionsFile:path.basename(actionsFile),
  bridgeConfig:before.bridge===null?readJson(exampleFile):readJson(bridgeFile),stickers:opts.stickers
 });
 if(before.bridge===null)result.changes.push('qq-bridge：用 config.example.json 创建了 config.json（还需要填写 dsh、ownerQQ 和 allow 列表）');
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
 const shown=t=>opts.showToken?t:(t?`（已设置，${t.length} 个字符；加 ${showTokenSwitch()} 可以显示原文）`:'（没有设置）');
 return {
  check:opts.check,changes:result.changes.length?result.changes:['没有需要修改的内容'],written,backups,
  endpoint:{...result.endpoint,wsAccessToken:shown(result.endpoint.wsAccessToken),httpAccessToken:shown(result.endpoint.httpAccessToken)},
  media:ffmpegCheck(result.bridgeConfig),
  rollback:backups.length?'回退方法：停止 qq-bridge 和 NeroNet，把每个 *.bak-qqbridge-<时间> 文件复制回它原来的文件，再重新启动':'没有写入任何文件',
  next:written.length?['重启 NeroNet（先运行 stop.bat，再运行 start.bat），让它读取动作档案和服务配置','启动或重启 qq-bridge（在它的目录里运行 npm start）']:[]
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))),null,2));}
 catch(error){console.error('connect-qqbridge：'+error.message);process.exitCode=1;}
}
