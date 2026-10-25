import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

async function pluginUi() {
  const html = await readFile(new URL('../plugin/ui.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'plugin UI script exists');
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, onclick: null });
    return elements.get(id);
  } };
  const parentMessages = [];
  const parent = { postMessage(message) { parentMessages.push(message); } };
  const top = {};
  const window = {};
  const sockets = [];
  class WebSocketStub {
    constructor(url) { this.url = url; sockets.push(this); }
  }
  runInNewContext(script.replace('__BRIDGE_CONFIG__', JSON.stringify({ port: 3848, token: 'synthetic-test-token' })),
    { document, parent, top, window, WebSocket: WebSocketStub, clearTimeout, setTimeout });
  assert.equal(parentMessages[0]?.pluginMessage?.type, 'ready');
  return { window, parent, top, elements, sockets };
}

test('Figma top-frame info connects while unrelated messages are ignored', async () => {
  const { window, parent, top, elements, sockets } = await pluginUi();
  const info = { pluginMessage: { type: 'info', documentId: 'synthetic-document', name: 'Scratch', page: 'Page 1' } };
  window.onmessage({ source: top, origin: 'https://unrelated.example', data: info });
  window.onmessage({ source: {}, origin: 'https://www.figma.com', data: info });
  assert.equal(sockets.length, 0);
  assert.equal(elements.get('file')?.textContent ?? '', '');
  window.onmessage({ source: top, origin: 'https://www.figma.com', data: info });
  assert.equal(elements.get('file').textContent, 'Scratch');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, 'ws://localhost:3848/plugin');

  const legacy = await pluginUi();
  legacy.window.onmessage({ source: legacy.parent, origin: 'null', data: info });
  assert.equal(legacy.sockets.length, 1);
});
