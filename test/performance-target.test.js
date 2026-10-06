import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTarget } from '../performance-testing/skills/performance-testing/scripts/safe-target.js';

for (const url of ['http://localhost:3000', 'https://STAGING.example.com/v1?x=1', 'http://127.0.0.1:8080/']) {
  test(`performance target permits exact allowlisted host: ${url}`, () => {
    assert.ok(assertSafeTarget(url, ['localhost', 'staging.example.com', '127.0.0.1']));
  });
}
for (const url of [
  'https://staging.example.com:password@production.example.com',
  'https://staging.example.com@production.example.com',
  'https://staging.example.com.evil.test', 'https://production.example.com',
  'https://staging.example.com\\@production.example.com',
  'https://staging.example.com:99999/', 'https://staging.example.com:0/',
  'file://staging.example.com/', '//staging.example.com',
  'https://staging.example.com\n.evil.test', 'http://[::1]:3000', '', undefined,
]) {
  test(`performance target rejects ambiguous/unapproved URL: ${JSON.stringify(url)}`, () => {
    assert.throws(() => assertSafeTarget(url, ['staging.example.com']), /Refusing target/);
  });
}
