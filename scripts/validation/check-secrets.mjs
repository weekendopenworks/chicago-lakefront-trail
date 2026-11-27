import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publicFiles } from '../lib/public-files.mjs';

export function scanFiles(files) {
  const findings = [];
  const rules = [
    ['private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/],
    ['access token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
    ['service key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
    ['credential in URL', /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/:"<>]+:[^\s/@"<>]+@/],
    ['credential assignment', /\b(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[=:]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i],
    ['personal local path', /(?<![\w/])\/(?:home|Users)\/[A-Za-z0-9_.-]+\//],
    ['personal Windows/WSL path', /(?<![\w/\\])(?:[A-Z]:[\\/]+Users[\\/]+[^\\/\s"<>]+[\\/]|[\\/]{2,}wsl(?:\.localhost|\$)[\\/]+[^\\/\s"<>]+[\\/]+home[\\/]+[^\\/\s"<>]+[\\/])/i],
    ['retired hosting identity', /"(?:site_id|projectId|orgId)"\s*:\s*"[a-zA-Z0-9_-]+"/],
  ];
  for (const file of files) {
    // SVG embeds compressed image bytes as base64. These are inspected as image
    // metadata separately, not interpreted as plaintext credential strings.
    const bytes = fs.readFileSync(file);
    const binary = /\.(?:png|jpg|webp|woff2)$/.test(file);
    const text = (binary ? bytes.toString('latin1') : bytes.toString('utf8')).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '[embedded image]');
    for (const [rule, pattern] of rules) if (pattern.test(text)) findings.push({ file, rule });
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = publicFiles();
  const findings = scanFiles(files);
  if (findings.length) {
    for (const { file, rule } of findings) console.error(`${file}: possible ${rule} (value withheld)`);
    process.exitCode = 1;
  } else console.log(`PASS: ${files.length} repository files scanned locally for known credential and private-path patterns. This is not a guarantee of absence.`);
}
