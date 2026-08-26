#!/usr/bin/env node

const [base, discoveryJson, tokenJson] = process.argv.slice(2);
const expected = `${base}/realms/master`;
let discovery;
let token;
try {
  discovery = JSON.parse(discoveryJson);
  token = JSON.parse(tokenJson).access_token;
} catch {
  throw new Error('Keycloak discovery or token response is invalid JSON');
}
if (discovery.issuer !== expected || typeof token !== 'string') {
  throw new Error('Keycloak issuer or token response does not match the manifest');
}
const payload = token.split('.')[1];
if (!payload) throw new Error('Keycloak token is malformed');
let claims;
try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
catch { throw new Error('Keycloak token payload is invalid'); }
if (claims.iss !== expected) throw new Error('Keycloak token issuer does not match the manifest');
