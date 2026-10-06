// Dependency-free for k6 and Node. Deliberately supports DNS/IPv4 targets only.
// Credentials, backslashes, whitespace, implicit schemes and IPv6 fail closed.
// Host allowlisting is not a DNS/network sandbox. Keep redirects disabled and
// use network isolation for untrusted targets or DNS.
export function assertSafeTarget(baseURL, allowedHosts) {
  const match = typeof baseURL === 'string' && baseURL.match(/^https?:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s\\]*)?$/i);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) {
    throw new Error('Refusing target: use an explicit HTTP(S) DNS/IPv4 URL without credentials');
  }
  const host = match[1].toLowerCase();
  if (!Array.isArray(allowedHosts) || !allowedHosts.some(value => typeof value === 'string' && value.trim().toLowerCase() === host)) {
    throw new Error(`Refusing target: ${host} is not in the allowlist`);
  }
  return host;
}
