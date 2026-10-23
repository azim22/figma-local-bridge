import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { settings, local } from './settings.mjs';

export async function connectBridge({ start = true } = {}) {
  const config = await settings();
  const url = `http://127.0.0.1:${config.port}`;
  const headers = { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' };
  async function status() {
    const response = await fetch(`${url}/status`, { headers, signal: AbortSignal.timeout(1200) });
    if (!response.ok) throw new Error(`Bridge returned ${response.status}. Port ${config.port} may be in use.`);
    const result = await response.json();
    if (result.service !== 'figma-local-bridge') throw new Error('Unexpected service on bridge port');
    return result;
  }
  try { await status(); }
  catch (error) {
    if (!start || error.message.includes('Bridge returned') || error.message.includes('Unexpected service')) throw error;
    const log = await open(new URL('bridge.log', local), 'a', 0o600);
    const child = spawn(process.execPath, [fileURLToPath(new URL('bridge.mjs', import.meta.url)), '--daemon'], {
      detached: true, stdio: ['ignore', log.fd, log.fd]
    });
    child.unref(); await log.close();
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { await status(); ready = true; break; } catch {}
    }
    if (!ready) throw new Error('Bridge did not start. Inspect .local/bridge.log.');
  }
  return {
    status,
    async stop() {
      const response = await fetch(`${url}/shutdown`, { method: 'POST', headers, signal: AbortSignal.timeout(2000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      return result;
    },
    async command(action, args = {}) {
      const current = await status();
      if (!current.connected) throw new Error('Open the Figma Local Bridge development plugin in Figma first.');
      if (!['document','fonts'].includes(action) && !args.targetDocumentId) throw new Error('Read document first and pass targetDocumentId explicitly.');
      const targetDocumentId = args.targetDocumentId ?? current.plugin.documentId;
      const response = await fetch(`${url}/command`, {
        method: 'POST', headers,
        body: JSON.stringify({ action, ...args, targetDocumentId }),
        signal: AbortSignal.timeout(50000)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      return result;
    }
  };
}
