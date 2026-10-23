import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createBridge } from '../bridge.mjs';

test('stdio MCP discovers tools and round-trips a simulated plugin without live Figma', {timeout:15000}, async t=>{
  const state=await mkdtemp(join(tmpdir(),'figma-local-bridge test-'));
  const token='a'.repeat(64);
  const bridge=await createBridge({port:0,token});
  t.after(async()=>{await bridge.close();await rm(state,{recursive:true,force:true});});
  await writeFile(join(state,'settings.json'),JSON.stringify({port:bridge.port,token}),{mode:0o600});
  const client=new Client({name:'figma-local-bridge-smoke-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server.mjs',import.meta.url))],env:{...process.env,FIGMA_BRIDGE_STATE_DIR:state},stderr:'pipe'});
  try {
    await client.connect(transport);
    const {tools}=await client.listTools();assert.equal(tools.length,10);
    assert.ok(tools.find(t=>t.name==='figma_create_nodes').inputSchema.required.includes('targetDocumentId'));
    assert.equal(tools.find(t=>t.name==='figma_delete_nodes').annotations.destructiveHint,true);
    const result=await client.callTool({name:'figma_status',arguments:{}});
    assert.equal(result.isError,undefined);
    assert.equal(JSON.parse(result.content[0].text).service,'figma-local-bridge');
    assert.equal(JSON.parse(result.content[0].text).connected,false);
    const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/plugin`,{origin:'https://www.figma.com'});
    await once(ws,'open');
    ws.send(JSON.stringify({type:'hello',token,documentId:'test-session',name:'Scratch file',page:'Page 1'}));
    await once(ws,'message');
    const commands=[];
    ws.on('message',raw=>{
      const command=JSON.parse(raw.toString());commands.push(command);
      const response=command.action==='export_node'
        ? {mimeType:'image/png',base64:'iVBORw0KGgo='}
        : {documentId:'test-session',name:'Scratch file',tree:{type:'PAGE'}};
      ws.send(JSON.stringify({id:command.id,result:response}));
    });
    const doc=await client.callTool({name:'figma_document',arguments:{depth:1}});
    assert.equal(JSON.parse(doc.content[0].text).documentId,'test-session');
    assert.equal(commands[0].targetDocumentId,'test-session');
    const invalid=await client.callTool({name:'figma_create_nodes',arguments:{targetDocumentId:'test-session',nodesJson:'not json'}});
    assert.equal(invalid.isError,true);assert.equal(commands.length,1);
    const preview=await client.callTool({name:'figma_export_node',arguments:{nodeId:'1:2',targetDocumentId:'test-session'}});
    assert.equal(preview.content[0].type,'image');assert.equal(preview.content[0].mimeType,'image/png');
  }finally{await client.close();}
});
