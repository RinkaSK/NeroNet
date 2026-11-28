// Connect a NeroNet installation to AstrBot in one step.
//
//   node connect-astrbot.mjs --home <NeroNet data directory>
//        [--astrbot-data <AstrBot data directory>]   same machine: also writes AstrBot's platform entry
//        [--url ws://127.0.0.1:6199/ws]              where AstrBot's aiocqhttp adapter listens
//        [--token <value>]                           reuse a token; otherwise kept or generated
//        [--uin <bot QQ>] [--check] [--show-token]
//
// NeroNet side: adds/updates the reverse WebSocket client "astrbot" in
// config/onebot_<QQ>.json (the actions AstrBot uses are enabled by default).
// AstrBot side (only with --astrbot-data): adds/updates the aiocqhttp platform
// "neronet" in cmd_config.json. Every changed file is backed up first.
// Restart NeroNet (and AstrBot, when its file changed) afterwards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CLIENT_NAME='astrbot', PLATFORM_ID='neronet';

// The switch that prints the token, as the caller knows it (the PowerShell script or this tool).
const restartNeroNet=process.platform==='win32'?'先运行 stop.bat，再运行 start.bat':'先运行 ./stop.sh，再运行 ./start.sh';
const showTokenSwitch=()=>process.env.NERONET_TOOL_ENTRY==='powershell'?'-ShowToken':'--show-token';

export function parseArgs(argv){
 const out={check:false,showToken:false,url:'ws://127.0.0.1:6199/ws'};
 for(let i=0;i<argv.length;i++){
  const a=argv[i],next=()=>{const v=argv[++i];if(v===undefined||v.startsWith('--'))throw Error(`${a} 后面需要一个值`);return v;};
  if(a==='--home')out.home=next();else if(a==='--astrbot-data')out.astrbotData=next();else if(a==='--url')out.url=next();
  else if(a==='--token')out.token=next();else if(a==='--uin')out.uin=next();else if(a==='--check')out.check=true;
  else if(a==='--show-token')out.showToken=true;else throw Error('不认识的参数 '+a);
 }
 if(!out.home)throw Error('需要用 --home 指定 NeroNet 的数据目录');
 let u;try{u=new URL(out.url);}catch{throw Error('--url 必须是 ws:// 或 wss:// 地址');}
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')throw Error('--url 必须是 ws:// 或 wss:// 地址');
 if(out.token!==undefined&&(out.token.length<16||/\s/.test(out.token)))throw Error('--token 至少 16 个字符，不能有空格');
 if(out.uin!==undefined&&!/^\d{5,12}$/.test(out.uin))throw Error('--uin 必须是 QQ 号');
 return out;
}

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));
const stamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'');

export function findOneBotConfig(configDir,uin){
 if(!fs.existsSync(configDir))throw Error(`${path.dirname(configDir)} 里没有 config 目录：请先用这个数据目录启动一次 NeroNet`);
 const files=fs.readdirSync(configDir).filter(n=>/^onebot_\d+\.json$/.test(n));
 const pick=uin?files.filter(n=>n===`onebot_${uin}.json`):files;
 if(pick.length===0)throw Error(uin?`没有找到 config/onebot_${uin}.json`:'还没有 config/onebot_<QQ>.json：请先登录机器人 QQ 并启动一次 NeroNet');
 if(pick.length>1)throw Error('找到多个机器人账号的配置，请用 --uin 指定其中一个：'+files.join(', '));
 return path.join(configDir,pick[0]);
}

/** Pure planning: returns the new documents and what changed. */
export function plan({onebot,astrbot,url,token}){
 const changes=[];
 const u=new URL(url);
 // NeroNet reverse WebSocket client
 const nets=onebot.networks??(onebot.networks={});
 const clients=Array.isArray(nets.wsClients)?nets.wsClients:(nets.wsClients=[]);
 const existing=clients.find(c=>c?.name===CLIENT_NAME);
 const astrPlatform=astrbot?.platform?.find?.(p=>p?.id===PLATFORM_ID);
 const chosen=token??existing?.accessToken??astrPlatform?.ws_reverse_token??crypto.randomBytes(32).toString('base64url');
 const want={name:CLIENT_NAME,enabled:true,url:u.toString(),role:'Universal',accessToken:chosen,messageFormat:'array',reportSelfMessage:false,reconnectIntervalMs:5000};
 if(!existing){clients.push(want);changes.push('NeroNet：添加了反向 WebSocket 客户端 "astrbot"');}
 else{
  const before=JSON.stringify(existing);Object.assign(existing,want);
  if(JSON.stringify(existing)!==before)changes.push('NeroNet：更新了反向 WebSocket 客户端 "astrbot"');
 }
 // AstrBot platform
 if(astrbot){
  const platforms=Array.isArray(astrbot.platform)?astrbot.platform:(astrbot.platform=[]);
  const host=['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)?'127.0.0.1':'0.0.0.0';
  const port=Number(u.port||(u.protocol==='wss:'?443:80));
  const p={id:PLATFORM_ID,type:'aiocqhttp',enable:true,ws_reverse_host:host,ws_reverse_port:port,ws_reverse_token:chosen};
  const cur=platforms.find(x=>x?.id===PLATFORM_ID);
  if(!cur){platforms.push(p);changes.push('AstrBot：添加了 aiocqhttp 平台 "neronet"');}
  else{const before=JSON.stringify(cur);Object.assign(cur,p);if(JSON.stringify(cur)!==before)changes.push('AstrBot：更新了 aiocqhttp 平台 "neronet"');}
  const others=platforms.filter(x=>x?.type==='aiocqhttp'&&x.id!==PLATFORM_ID&&x.enable!==false&&Number(x.ws_reverse_port)===port);
  if(others.length)changes.push(`warning: AstrBot platform "${others[0].id}" also uses port ${port}; disable one of them`);
 }
 return {onebot,astrbot,token:chosen,changes};
}

export function run(opts){
 const home=path.resolve(opts.home),configDir=path.join(home,'config');
 const onebotFile=findOneBotConfig(configDir,opts.uin);
 const astrFile=opts.astrbotData?path.join(path.resolve(opts.astrbotData),'cmd_config.json'):null;
 if(astrFile&&!fs.existsSync(astrFile))throw Error(opts.astrbotData+' 里没有 cmd_config.json：请先启动一次 AstrBot');
 const before={onebot:fs.readFileSync(onebotFile,'utf8'),astrbot:astrFile?fs.readFileSync(astrFile,'utf8'):null};
 const result=plan({onebot:readJson(onebotFile),astrbot:astrFile?readJson(astrFile):null,url:opts.url,token:opts.token});
 const writes=[[onebotFile,JSON.stringify(result.onebot,null,2)+'\n',before.onebot]];
 if(astrFile)writes.push([astrFile,JSON.stringify(result.astrbot,null,2),before.astrbot]);
 const written=[];
 if(!opts.check){
  const tag=stamp();
  for(const [file,text,old] of writes){
   if(old!==null&&JSON.stringify(JSON.parse(old.replace(/^﻿/,'')))===JSON.stringify(JSON.parse(text)))continue;
   if(old!==null)fs.copyFileSync(file,`${file}.bak-astrbot-${tag}`);
   fs.writeFileSync(file,text);written.push(file);
  }
 }
 const remote=!astrFile;
 return {
  check:opts.check,changes:result.changes.length?result.changes:['没有需要修改的内容'],written,
  astrbotSetup:remote?{note:'请在 AstrBot 管理界面「平台」中新增 OneBot v11（aiocqhttp），填入下面三项',ws_reverse_host:'0.0.0.0',ws_reverse_port:Number(new URL(opts.url).port||6199),ws_reverse_token:opts.showToken?result.token:`（没有显示；加 ${showTokenSwitch()} 重新运行可以显示）`}:null,
  next:['重启 NeroNet：'+restartNeroNet,...(astrFile&&written.includes(astrFile)?['重启 AstrBot，让它读取新的平台配置']:[])],
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))),null,2));}
 catch(error){console.error('connect-astrbot：'+error.message);process.exitCode=1;}
}
