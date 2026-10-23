import { readFile, writeFile } from 'node:fs/promises';
import { connectBridge } from './client.mjs';
const [action='status',inputPath,outputPath]=process.argv.slice(2);
try {
  const bridge=await connectBridge({start:action!=='stop'});
  const result=action==='stop'?await bridge.stop():action==='status'?await bridge.status():await bridge.command(action,inputPath?JSON.parse(await readFile(inputPath,'utf8')):{});
  if(result.base64&&outputPath){await writeFile(outputPath,Buffer.from(result.base64,'base64'));delete result.base64;result.outputPath=outputPath;}
  if(result.base64&&!outputPath){delete result.base64;result.error='Pass an output path to save the PNG.';}
  console.log(JSON.stringify(result,null,2));
  if(result.error)process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
