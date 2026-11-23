// Verified whole-file adaptation. No upstream source snippets are embedded here.
// Inputs are identified by approved content hashes; renamed inputs must be unique.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const manifest=JSON.parse(fs.readFileSync(path.join(here,'UPSTREAM.json'),'utf8'));
export const BACKUP_DIR='.neronet-adapter-backup';
export const MARKER='NERONET_ADAPTATION.json';
export const TOUCHED=Object.keys(manifest.files);
export const ADDED=TOUCHED.filter(p=>!manifest.files[p].upstream);
export const NON_ASCII_FILES=['roles/小鲸鱼.md','roles/傲娇助手.md','assets/deepseek娘.png'];
export const lf=s=>s.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
export const hash=s=>crypto.createHash('sha256').update(lf(s),'utf8').digest('hex');
function resolveFile(root,rel) {
 if(typeof rel!=='string'||!rel||rel.includes('\\')||rel.includes(':')||path.isAbsolute(rel)||rel.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Unsafe adapter path');
 const base=path.resolve(root),file=path.resolve(base,rel);
 if(!file.startsWith(base+path.sep))throw Error('Adapter path escapes root');
 let cur=base;
 for(const part of [null,...rel.split('/')]){if(part!==null)cur=path.join(cur,part);if(fs.lstatSync(cur,{throwIfNoEntry:false})?.isSymbolicLink())throw Error('Adapter refuses linked paths');}
 return file;
}
const read=(root,rel)=>{const p=resolveFile(root,rel);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;};
export function missingNonAsciiFiles(root){return NON_ASCII_FILES.filter(p=>!fs.existsSync(resolveFile(root,p)));}
function sourceFor(root,rel,spec) {
 if(spec.sourcePath){const raw=read(root,spec.sourcePath);return raw===null?null:{rel:spec.sourcePath,raw};}
 if(!spec.upstream)return null;
 const dir=spec.sourceDirectory==='.'?path.resolve(root):resolveFile(root,spec.sourceDirectory);
 const matches=[];
 if(fs.existsSync(dir))for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(!entry.isFile())continue;
  const p=(spec.sourceDirectory==='.'?'':spec.sourceDirectory+'/')+entry.name;
  const raw=read(root,p);
  if(spec.accepted.includes(hash(raw)))matches.push({rel:p,raw});
 }
 if(matches.length!==1)throw Error(`${rel}: expected one approved source file, found ${matches.length}`);
 return matches[0];
}
export function planAdapter(root) {
 const result=[];
 for(const [rel,spec] of Object.entries(manifest.files)){
  const shipped=read(path.join(here,'files'),rel);
  if(shipped===null||hash(shipped)!==spec.adapted)throw Error(`${rel}: adapter payload hash mismatch`);
  const current=read(root,rel);
  if(current!==null&&hash(current)===spec.adapted){result.push({rel,action:'already-adapted'});continue;}
  let source=current!==null?{rel,raw:current}:sourceFor(root,rel,spec);
  if(source&&!spec.accepted.includes(hash(source.raw)))throw Error(`${rel}: unrecognized local content; refusing to replace`);
  if(!source&&spec.upstream)throw Error(`${rel}: required upstream input missing`);
  const eol=source?.raw.includes('\r\n')?'\r\n':'\n';
  result.push({rel,action:source?'replace':'add',write:lf(shipped).replace(/\n/g,eol),before:current,source});
 }
 return result;
}
export function stateOf(plan){return plan.every(p=>p.action==='already-adapted')?'adapted':'upstream or older adaptation (apply to adapt)';}
// Store the complete rollback journal before touching code. A partial failure
// leaves the journal available for --revert rather than discarding recovery data.
export function applyPlan(root,plan) {
 const changes=plan.filter(p=>p.write!==undefined);if(!changes.length)return;
 const journalFile=resolveFile(root,BACKUP_DIR+'/journal.json');
 if(fs.existsSync(journalFile))throw Error('An existing adapter backup is present; revert it before changing adapter versions');
 const snapshots=new Map();
 for(const step of changes){
  if(read(root,step.rel)!==step.before)throw Error(`${step.rel}: changed since planning`);
  snapshots.set(step.rel,step.before);
  if(step.source){if(read(root,step.source.rel)!==step.source.raw)throw Error(`${step.source.rel}: changed since planning`);snapshots.set(step.source.rel,step.source.raw);}
 }
 const entries=[];let index=0;
 for(const [rel,raw] of snapshots){
  const storage=raw===null?null:`${BACKUP_DIR}/files/${index++}.txt`;
  if(storage){const p=resolveFile(root,storage);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,raw,{flag:'wx'});}
  const target=changes.find(x=>x.rel===rel);
  entries.push({rel,storage,before:raw===null?null:hash(raw),after:target?hash(target.write):null});
 }
 fs.mkdirSync(path.dirname(journalFile),{recursive:true});
 fs.writeFileSync(journalFile,JSON.stringify({version:1,entries,markerBefore:read(root,MARKER)},null,2)+'\n',{flag:'wx'});
 try{
  for(const s of changes){const p=resolveFile(root,s.rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s.write);if(s.source&&s.source.rel!==s.rel)fs.unlinkSync(resolveFile(root,s.source.rel));}
 }catch(e){throw Error(`Installation interrupted; use --revert to restore the saved files: ${e.message}`);}
}
export function planRevert(root){
 const raw=read(root,BACKUP_DIR+'/journal.json');if(raw===null)throw Error('No adapter rollback journal; no files changed');
 const journal=JSON.parse(raw);if(journal.version!==1||!Array.isArray(journal.entries))throw Error('Invalid rollback journal');
 const plan=[];const seen=new Set();
 for(const e of journal.entries){
  if(seen.has(e.rel))throw Error('Duplicate rollback path');seen.add(e.rel);
  const current=read(root,e.rel),h=current===null?null:hash(current);
  if(h!==e.before&&h!==e.after)throw Error(`${e.rel}: edited after adaptation; refusing to revert`);
  let saved=null;
  if(e.storage){if(!/^\.neronet-adapter-backup\/files\/\d+\.txt$/.test(e.storage))throw Error('Invalid backup storage path');saved=read(root,e.storage);if(saved===null||hash(saved)!==e.before)throw Error(`${e.rel}: rollback file hash mismatch`);}
  else if(e.before!==null)throw Error('Rollback file missing');
  plan.push({rel:e.rel,write:saved});
 }
 return {plan,markerBefore:journal.markerBefore??null};
}
export function revert(root){
 const {plan,markerBefore}=planRevert(root);
 for(const s of plan){const p=resolveFile(root,s.rel);if(s.write===null){if(fs.existsSync(p))fs.unlinkSync(p);}else{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s.write);}}
 const marker=resolveFile(root,MARKER);if(markerBefore===null){if(fs.existsSync(marker))fs.unlinkSync(marker);}else fs.writeFileSync(marker,markerBefore);
 // Delete only this installer's checked backup directory, never the target root.
 const backup=resolveFile(root,BACKUP_DIR);fs.rmSync(backup,{recursive:true,force:true});
}
export function main(argv){
 const target=argv.find(x=>!x.startsWith('--')),check=argv.includes('--check'),undo=argv.includes('--revert');
 if(!target||argv.some(x=>x.startsWith('--')&&!['--check','--revert'].includes(x))||(check&&undo)||argv.filter(x=>!x.startsWith('--')).length!==1)throw Error('usage: node apply-adapter.mjs <qq-bridge directory> [--check | --revert]');
 const root=path.resolve(target),pkg=JSON.parse(read(root,'package.json')??'null');if(pkg?.name!=='qq-bridge')throw Error('Target is not a qq-bridge checkout');
 if(undo){revert(root);console.log('done: restored the pre-install files; run npm ci before restarting');return;}
 const plan=planAdapter(root);for(const p of plan)console.log(`${p.action.padEnd(16)} ${p.rel}`);
 if(check){console.log(`state: ${stateOf(plan)}`);return;}
 applyPlan(root,plan);
 if(plan.some(p=>p.write!==undefined)||read(root,MARKER)===null)fs.writeFileSync(resolveFile(root,MARKER),JSON.stringify({adaptation:'NeroNet qq-bridge adapter',adapterVersion:manifest.adapterVersion,upstream:{repository:manifest.repository,tag:manifest.tag,commit:manifest.commit,license:manifest.license}},null,2)+'\n');
 console.log(plan.some(p=>p.write!==undefined)?'done: run `npm ci`, '+(process.platform==='win32'?'Connect-QQBridge':'connect-qqbridge.sh')+', and restart DSH and qq-bridge':'nothing to change');
}
