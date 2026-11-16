// Install the verified NeroNet adaptation of qq-bridge.
export * from './apply-files.mjs';
import {main} from './apply-files.mjs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main(process.argv.slice(2));}catch(e){console.error('refused: '+e.message);process.exitCode=1;}
}
