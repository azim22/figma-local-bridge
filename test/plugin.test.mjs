import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

// Test the real sandbox code against a small Figma API stub, not a real design file.
async function sandbox() {
  const mixed=Symbol('mixed');
  const text={id:'1:2',type:'TEXT',name:'Existing text',characters:'Two styles',fontName:mixed,
    getStyledTextSegments:()=>[{fontName:{family:'Inter',style:'Regular'}},{fontName:{family:'Inter',style:'Bold'}}]};
  const messages=[];
  const figma={mixed,root:{name:'Scratch'},currentPage:{name:'Page 1'},
    ui:{postMessage:message=>messages.push(message)},showUI(){},commitUndo(){},
    loadFontAsync:async()=>{},getNodeByIdAsync:async id=>id===text.id?text:null};
  const source=await readFile(new URL('../plugin/code.ts',import.meta.url),'utf8');
  runInNewContext(transformSync(source,{loader:'ts',target:'es2018'}).code,{figma,__html__:''});
  await figma.ui.onmessage({type:'ready'});
  const documentId=messages.pop().documentId;
  async function update(props,targetDocumentId=documentId) {
    await figma.ui.onmessage({type:'command',command:{id:'command-1',action:'update_nodes',targetDocumentId,updates:[{nodeId:text.id,props}]}});
    return messages.pop().result;
  }
  return {text,mixed,update};
}
test('non-font edits preserve mixed fonts; explicit replacement requires a complete font',async()=>{
  const {text,mixed,update}=await sandbox();
  assert.equal((await update({name:'Renamed',fill:'#123456'})).error,undefined);
  assert.equal(text.name,'Renamed');assert.equal(text.fontName,mixed);
  assert.match((await update({fontFamily:'Inter'})).error,/explicit fontFamily and fontStyle/);
  assert.equal(text.fontName,mixed);
  assert.equal((await update({fontFamily:'Inter',fontStyle:'Regular'})).error,undefined);
  assert.equal(text.fontName.family,'Inter');assert.equal(text.fontName.style,'Regular');
});
test('the plugin refuses stale session IDs before touching a node',async()=>{
  const {text,update}=await sandbox();
  assert.match((await update({name:'Wrong file'},'stale-session')).error,/Target document changed/);
  assert.equal(text.name,'Existing text');
});
