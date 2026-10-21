// Compatibility preload for existing launchers. Keep current system DNS;
// do not pin Cloudflare's APIs to tunnel-front IPs from an old registration.
if (process.env.RVC_DIRECT_NETWORK === '1') {
  for (const key of Object.keys(process.env)) {
    if (/^(?:(?:https?|all|ftp)_proxy|npm_config_(?:https_)?proxy|global_agent_https?_proxy)$/i.test(key)) {
      delete process.env[key];
    }
  }
  process.env.NO_PROXY = '*';
  process.env.NODE_USE_ENV_PROXY = '0';
}
