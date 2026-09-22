const dns = require('dns');

const CLEAN_IPS = ['172.66.47.151', '172.66.47.152'];
const origLookup = dns.lookup;

dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (hostname === 'api.cloudflare.com' || hostname === 'api.trycloudflare.com') {
    if (options && options.all) {
      return callback(null, [{ address: CLEAN_IPS[0], family: 4 }]);
    }
    return callback(null, CLEAN_IPS[0], 4);
  }
  return origLookup(hostname, options, callback);
};
