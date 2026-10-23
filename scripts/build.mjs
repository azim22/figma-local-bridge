import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { settings, root } from '../settings.mjs';
const config = await settings();
const dist = new URL('../dist/', import.meta.url);
await mkdir(dist,{recursive:true,mode:0o700});
await build({entryPoints:[`${root}plugin/code.ts`],outfile:`${root}dist/code.js`,bundle:true,target:'es2018',format:'iife'});
const template=await readFile(new URL('../plugin/ui.html',import.meta.url),'utf8');
await writeFile(new URL('ui.html',dist),template.replace('__BRIDGE_CONFIG__',JSON.stringify(config)),{mode:0o600});
await writeFile(new URL('manifest.json',dist),JSON.stringify({
  name:'Figma Local Bridge',...(config.pluginId ? {id:config.pluginId}:{}),api:'1.0.0',editorType:['figma'],main:'code.js',ui:'ui.html',documentAccess:'dynamic-page',
  networkAccess:{allowedDomains:['none'],devAllowedDomains:[`ws://localhost:${config.port}`]}
},null,2));
console.log(`Plugin built: ${root}dist/manifest.json`);
