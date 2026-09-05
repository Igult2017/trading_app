import fs from 'fs';
const md = fs.readFileSync('C:/Users/FSD/.claude/projects/c--Users-FSD-trading-app/memory/reference-coolify.md','utf8');
const TOK = (md.match(/`(3\|[A-Za-z0-9]+)`/)||[])[1];
const H = { Authorization: `Bearer ${TOK}` };
const j = await (await fetch('http://72.61.3.130:8000/api/v1/deploy?uuid=nok80c8kksg00so08884ggk4', { headers: H })).json();
const id = j.deployments?.[0]?.deployment_uuid;
console.log('queued', id);
for (let i = 0; i < 70; i++) {
  await new Promise(r => setTimeout(r, 20000));
  const d = await (await fetch(`http://72.61.3.130:8000/api/v1/deployments/${id}`, { headers: H })).json();
  const s = d.status ?? 'unknown';
  if (i % 3 === 0 || /finished|failed|cancelled/.test(String(s)))
    console.log(new Date().toISOString().slice(11,19), s);
  if (/finished|failed|cancelled/.test(String(s))) break;
}
const h = await fetch('https://www.fsdzones.cloud/api/health').catch(() => null);
console.log('health:', h ? h.status : 'no response');
