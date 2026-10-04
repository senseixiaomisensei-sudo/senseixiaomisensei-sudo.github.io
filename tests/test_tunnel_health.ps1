$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\rvc-service\tunnel_health.ps1')
if ((Get-RvcTunnelMetricsUrl 'Starting metrics server on 127.0.0.1:20241/metrics') -ne 'http://127.0.0.1:20241/metrics') { throw 'Metrics URL' }
if (Get-RvcTunnelMetricsUrl 'Starting metrics server on example.com:20241/metrics') { throw 'Non-loopback endpoint' }
if (-not (Test-RvcRegisteredMetrics "# HELP connections`ncloudflared_tunnel_ha_connections 1`n")) { throw 'Connected tunnel' }
if (Test-RvcRegisteredMetrics 'cloudflared_tunnel_ha_connections 0') { throw 'Disconnected tunnel' }
if (Test-RvcRegisteredMetrics '<html>Temporary error</html>') { throw 'Invalid metrics' }
Write-Output 'Tunnel connection contracts: 5 passed'
