async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node tools/check-deploy.mjs https://game.example.com');
  const origin = new URL(process.argv[2]);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Provide a public HTTPS origin without credentials, a path, or a query string.');
  }
  const request = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  const health = await request('/api/health');
  if (!health.ok) throw new Error(`Health check returned ${health.status}.`);
  const status = await health.json();
  if (status.ok !== true || status.mode !== 'telegram') throw new Error('Expected a healthy server in Telegram mode.');
  const ready = await request('/api/ready');
  if (!ready.ok || (await ready.json()).ok !== true) throw new Error('Database readiness check failed.');
  const page = await request('/');
  if (!page.ok || !(await page.text()).includes('id="root"')) throw new Error('Built frontend was not served.');
  const anonymous = await request('/api/state');
  if (anonymous.status !== 401) throw new Error(`Anonymous game state must be denied with 401, received ${anonymous.status}.`);
  console.log(JSON.stringify({ ok: true, origin: origin.origin, version: status.version, checks: ['https', 'telegram-mode', 'database-ready', 'frontend', 'anonymous-denied'] }));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Deployment check failed.');
  process.exitCode = 1;
});
