# Read only cloudflared's loopback metrics before replacing an active tunnel.
function Get-RvcTunnelMetricsUrl([string]$text) {
  $entries = [regex]::Matches($text, 'Starting metrics server on (127\.0\.0\.1:[0-9]+/metrics)')
  if ($entries.Count -eq 0) { return $null }
  return "http://$($entries[$entries.Count - 1].Groups[1].Value)"
}

function Test-RvcRegisteredMetrics([string]$text) {
  $entry = [regex]::Match($text, '(?m)^cloudflared_tunnel_ha_connections\s+([0-9]+(?:\.[0-9]+)?)\s*$')
  return $entry.Success -and [double]::Parse($entry.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture) -gt 0
}

function Test-RvcRegisteredTunnel([string]$logPath) {
  try {
    $text = Get-Content -LiteralPath "$logPath.err" -Raw -ErrorAction Stop
    $url = Get-RvcTunnelMetricsUrl $text
    if (-not $url) { return $false }
    $metrics = Invoke-WebRequest -Uri $url -TimeoutSec 3 -NoProxy -ErrorAction Stop
    return Test-RvcRegisteredMetrics ([string]$metrics.Content)
  } catch { return $false }
}
