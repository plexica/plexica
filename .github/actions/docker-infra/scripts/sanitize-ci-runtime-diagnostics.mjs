#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const registry = new Set();
const sensitiveKey = /(?:password|secret|token|pepper|encryption(?:_|-)?key|access(?:_|-)?key|authorization|cookie|email|phone|name|user(?:name)?|database_url|postgres_host_url)/i;
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const separator = line.indexOf('=');
    if (separator < 1 || !sensitiveKey.test(line.slice(0, separator))) continue;
    const value = line.slice(separator + 1).replace(/^['"]|['"]$/g, '').replace(/\\([\\'" ])/g, '$1');
    if (value.length > 2) registry.add(value);
    try { if (new URL(value).password) registry.add(new URL(value).password); } catch { /* not a URL */ }
  }
}

function variants(value) {
  const escaped = [...value].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  return [value, encodeURIComponent(value), Buffer.from(value).toString('base64'), JSON.stringify(value), escaped];
}

function redactText(input) {
  let output = input.replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  for (const secret of registry) {
    for (const value of variants(secret)) output = output.split(value).join('[REDACTED]');
  }
  output = output.replace(/(?:[A-Za-z0-9._~-]|%[0-9a-f]{2})+/gi, (value) => {
    try { return registry.has(decodeURIComponent(value)) ? '[REDACTED]' : value; }
    catch { return value; }
  });
  return output
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:access_)?(?:token|secret|password|key)=[^&#\s]*)/gi, (match) => `${match.split('=')[0]}=[REDACTED]`)
    .replace(/((?:authorization|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,"}]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(["']?(?:password|secret|token|pepper|(?:encryption|access)[_-]?key|authorization|cookie|email|phone|first[_-]?name|last[_-]?name|keycloak[_-]?admin[_-]?user|plugin[_-]?credential[_-]?pepper)["']?\s*[:=]\s*)["']?[^,\s}"']+["']?/gi, '$1[REDACTED]');
}

function redactJson(value, key = '') {
  if (sensitiveKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((entry) => redactJson(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, redactJson(entry, name)]));
  }
  return typeof value === 'string' ? redactText(value) : value;
}

const source = readFileSync(0, 'utf8');
const output = source.split(/(?<=\n)/).map((line) => {
  try { return `${JSON.stringify(redactJson(JSON.parse(line)))}${line.endsWith('\n') ? '\n' : ''}`; }
  catch { return redactText(line); }
}).join('');
process.stdout.write(output);
