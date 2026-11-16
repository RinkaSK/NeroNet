// Connect a NeroNet installation to AstrBot in one step.
//
//   node connect-astrbot.mjs --home <NeroNet data directory>
//        [--astrbot-data <AstrBot data directory>]   same machine: also writes AstrBot's platform entry
//        [--url ws://127.0.0.1:6199/ws]              where AstrBot's aiocqhttp adapter listens
//        [--token <value>]                           reuse a token; otherwise kept or generated
//        [--uin <bot QQ>] [--check] [--show-token]
//
// NeroNet side: adds/updates the reverse WebSocket client "astrbot" in
// config/onebot_<QQ>.json and enables the "astrbot" action profile
// (current action settings, with a compatibility reader for older installations).
// AstrBot side (only with --astrbot-data): adds/updates the aiocqhttp platform
// "neronet" in cmd_config.json. Every changed file is backed up first.
// Restart NeroNet (and AstrBot, when its file changed) afterwards.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CLIENT_NAME='astrbot', PLATFORM_ID='neronet';

export function parseArgs(argv){
 const out={check:false,showToken:false,url:'ws://127.0.0.1:6199/ws'};
 for(let i=0;i<argv.length;i++){
  const a=argv[i],next=()=>{const v=argv[++i];if(v===undefined||v.startsWith('--'))throw Error(`${a} needs a value`);return v;};
  if(a==='--home')out.home=next();else if(a==='--astrbot-data')out.astrbotData=next();else if(a==='--url')out.url=next();
  else if(a==='--token')out.token=next();else if(a==='--uin')out.uin=next();else if(a==='--check')out.check=true;
  else if(a==='--show-token')out.showToken=true;else throw Error('Unknown argument '+a);
 }
 if(!out.home)throw Error('--home <NeroNet data directory> is required');
 let u;try{u=new URL(out.url);}catch{throw Error('--url must be a ws:// or wss:// URL');}
 if(u.protocol!=='ws:'&&u.protocol!=='wss:')throw Error('--url must be a ws:// or wss:// URL');
 if(out.token!==undefined&&(out.token.length<16||/\s/.test(out.token)))throw Error('--token must be at least 16 characters without spaces');
 if(out.uin!==undefined&&!/^\d{5,12}$/.test(out.uin))throw Error('--uin must be a QQ number');
 return out;
}

const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));
const stamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'');

export function findOneBotConfig(configDir,uin){
 if(!fs.existsSync(configDir))throw Error(`No config directory in ${path.dirname(configDir)}: start NeroNet once with this data directory first`);
 const files=fs.readdirSync(configDir).filter(n=>/^onebot_\d+\.json$/.test(n));
 const pick=uin?files.filter(n=>n===`onebot_${uin}.json`):files;
 if(pick.length===0)throw Error(uin?`config/onebot_${uin}.json not found`:'No config/onebot_<QQ>.json yet: start NeroNet once and log in the bot first');
 if(pick.length>1)throw Error('Several bot accounts found; choose one with --uin: '+files.join(', '));
 return path.join(configDir,pick[0]);
}

/** Pure planning: returns the new documents and what changed. */
export function plan({onebot,actions,actionsFile,astrbot,url,token}){
 const changes=[];
 const u=new URL(url);
 // NeroNet reverse WebSocket client
 const nets=onebot.networks??(onebot.networks={});
 const clients=Array.isArray(nets.wsClients)?nets.wsClients:(nets.wsClients=[]);
 const existing=clients.find(c=>c?.name===CLIENT_NAME);
 const astrPlatform=astrbot?.platform?.find?.(p=>p?.id===PLATFORM_ID);
 const chosen=token??existing?.accessToken??astrPlatform?.ws_reverse_token??crypto.randomBytes(32).toString('base64url');
 const want={name:CLIENT_NAME,enabled:true,url:u.toString(),role:'Universal',accessToken:chosen,messageFormat:'array',reportSelfMessage:false,reconnectIntervalMs:5000};
 if(!existing){clients.push(want);changes.push('NeroNet: added reverse WebSocket client "astrbot"');}
 else{
  const before=JSON.stringify(existing);Object.assign(existing,want);
  if(JSON.stringify(existing)!==before)changes.push('NeroNet: updated reverse WebSocket client "astrbot"');
 }
 // action profile
 const policy=actions??{};
 if(typeof policy!=='object'||Array.isArray(policy))throw Error(actionsFile+' is not a JSON object');
 const profiles=Array.isArray(policy.profiles)?policy.profiles:[];
 if(!profiles.includes('astrbot')){policy.profiles=[...profiles,'astrbot'];changes.push(`NeroNet: enabled the astrbot action profile in ${actionsFile}`);}
 // AstrBot platform
 if(astrbot){
  const platforms=Array.isArray(astrbot.platform)?astrbot.platform:(astrbot.platform=[]);
  const host=['127.0.0.1','localhost','::1','[::1]'].includes(u.hostname)?'127.0.0.1':'0.0.0.0';
  const port=Number(u.port||(u.protocol==='wss:'?443:80));
  const p={id:PLATFORM_ID,type:'aiocqhttp',enable:true,ws_reverse_host:host,ws_reverse_port:port,ws_reverse_token:chosen};
  const cur=platforms.find(x=>x?.id===PLATFORM_ID);
  if(!cur){platforms.push(p);changes.push('AstrBot: added aiocqhttp platform "neronet"');}
  else{const before=JSON.stringify(cur);Object.assign(cur,p);if(JSON.stringify(cur)!==before)changes.push('AstrBot: updated aiocqhttp platform "neronet"');}
  const others=platforms.filter(x=>x?.type==='aiocqhttp'&&x.id!==PLATFORM_ID&&x.enable!==false&&Number(x.ws_reverse_port)===port);
  if(others.length)changes.push(`warning: AstrBot platform "${others[0].id}" also uses port ${port}; disable one of them`);
 }
 return {onebot,actions:policy,astrbot,token:chosen,changes};
}

export function run(opts){
 const home=path.resolve(opts.home),configDir=path.join(home,'config');
 const onebotFile=findOneBotConfig(configDir,opts.uin);
 const actionsFile=path.join(configDir,'neronet-actions.json');
 const astrFile=opts.astrbotData?path.join(path.resolve(opts.astrbotData),'cmd_config.json'):null;
 if(astrFile&&!fs.existsSync(astrFile))throw Error('cmd_config.json not found in '+opts.astrbotData+': start AstrBot once first');
 const before={onebot:fs.readFileSync(onebotFile,'utf8'),actions:fs.existsSync(actionsFile)?fs.readFileSync(actionsFile,'utf8'):null,astrbot:astrFile?fs.readFileSync(astrFile,'utf8'):null};
 const result=plan({onebot:readJson(onebotFile),actions:before.actions===null?{}:readJson(actionsFile),actionsFile:path.basename(actionsFile),astrbot:astrFile?readJson(astrFile):null,url:opts.url,token:opts.token});
 const writes=[[onebotFile,JSON.stringify(result.onebot,null,2)+'\n',before.onebot],[actionsFile,JSON.stringify(result.actions,null,2)+'\n',before.actions]];
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
  check:opts.check,changes:result.changes,written,
  astrbotSetup:remote?{note:'Add this platform in AstrBot (WebUI → 平台 → aiocqhttp)',ws_reverse_host:'0.0.0.0',ws_reverse_port:Number(new URL(opts.url).port||6199),ws_reverse_token:opts.showToken?result.token:'(run again with --show-token to print it)'}:null,
  next:['Restart NeroNet: Stop-NeroNet.ps1, then Start-NeroNet.ps1',...(astrFile&&written.includes(astrFile)?['Restart AstrBot so it reads the new platform']:[])],
 };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(run(parseArgs(process.argv.slice(2))),null,2));}
 catch(error){console.error('connect-astrbot: '+error.message);process.exitCode=1;}
}
