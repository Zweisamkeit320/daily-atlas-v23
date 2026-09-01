[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [Alias("Origin")]
  [Uri]$BaseUrl,

  [ValidateSet("CloudflarePages", "GitHubPages")]
  [string]$HostingProfile = "CloudflarePages",

  [string]$StaticDirectory = ".\daily-atlas-static",

  # Test-only escape hatch. It never permits HTTP and is rejected for non-loopback hosts.
  [switch]$AllowInsecureLoopback
)

$ErrorActionPreference = "Stop"
$allowedRedirectStatuses = @(301, 302, 303, 307, 308)
$maxRedirects = 5
$results = @()
$pageResponses = @{}
$pageBodies = @{}
$publicConfigBody = $null
$manifestBody = $null
$manifestResponse = $null

if (-not $BaseUrl.IsAbsoluteUri) {
  throw "BaseUrl must be an absolute HTTPS URL."
}
if ($BaseUrl.Scheme -ne "https") {
  throw "BaseUrl must use HTTPS: $($BaseUrl.AbsoluteUri)"
}
if ($BaseUrl.UserInfo) {
  throw "BaseUrl must not contain user information."
}
if ($BaseUrl.Query -or $BaseUrl.Fragment) {
  throw "BaseUrl must not contain a query string or fragment."
}
if ($AllowInsecureLoopback -and -not $BaseUrl.IsLoopback) {
  throw "AllowInsecureLoopback is restricted to localhost or loopback addresses."
}

$baseText = $BaseUrl.GetLeftPart([UriPartial]::Path).TrimEnd("/") + "/"
$baseUri = [Uri]$baseText
$expectedAuthority = $baseUri.Authority
$basePath = [Uri]::UnescapeDataString($baseUri.AbsolutePath.Replace("\", "/"))
if (-not $basePath.EndsWith("/")) { $basePath += "/" }

function Assert-UriBoundary {
  param(
    [Parameter(Mandatory = $true)]
    [Uri]$Uri,

    [Parameter(Mandatory = $true)]
    [string]$Context
  )

  if (-not $Uri.IsAbsoluteUri -or $Uri.Scheme -ne "https") {
    throw "Non-HTTPS URL rejected: $Context -> $($Uri.AbsoluteUri)"
  }
  if ($Uri.UserInfo) {
    throw "User-info URL rejected: $Context -> $($Uri.AbsoluteUri)"
  }
  if (-not [string]::Equals($Uri.Authority, $expectedAuthority, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Cross-authority URL rejected: $Context -> $($Uri.AbsoluteUri)"
  }

  $decodedPath = [Uri]::UnescapeDataString($Uri.AbsolutePath.Replace("\", "/"))
  $segments = $decodedPath.Split("/", [StringSplitOptions]::RemoveEmptyEntries)
  if ($segments -contains "." -or $segments -contains "..") {
    throw "Encoded path traversal rejected: $Context -> $($Uri.AbsoluteUri)"
  }
  if (-not $decodedPath.StartsWith($basePath, [StringComparison]::Ordinal)) {
    throw "URL escapes BaseUrl path: $Context -> $($Uri.AbsoluteUri) (base $($baseUri.AbsoluteUri))"
  }
}

function Resolve-BaseResource {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$RelativePath
  )

  if ($RelativePath.StartsWith("/") -or $RelativePath.StartsWith("\")) {
    throw "Resource paths must be relative to BaseUrl: $RelativePath"
  }
  $resolved = [Uri]::new($baseUri, $RelativePath)
  Assert-UriBoundary -Uri $resolved -Context "resource '$RelativePath'"
  return $resolved
}

Assert-UriBoundary -Uri $baseUri -Context "BaseUrl"

function Get-HeaderValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Headers,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $matches = [Regex]::Matches($Headers, "(?im)^$([Regex]::Escape($Name)):\s*(.+?)\r?$")
  if ($matches.Count -eq 0) { return $null }
  return $matches[$matches.Count - 1].Groups[1].Value.Trim()
}

function Invoke-BoundedRequest {
  param(
    [Parameter(Mandatory = $true)]
    [Uri]$RequestUri,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [string]$OutputFile
  )

  Assert-UriBoundary -Uri $RequestUri -Context $Label
  $current = $RequestUri
  $chain = @($current.AbsoluteUri)

  for ($hop = 0; $hop -le $maxRedirects; $hop += 1) {
    Assert-UriBoundary -Uri $current -Context "$Label hop $hop"
    $headerFile = New-TemporaryFile
    try {
      $curlArguments = @(
        "-sS",
        "--compressed",
        "--retry", "2",
        "--retry-all-errors",
        "--retry-delay", "1",
        "--retry-max-time", "90",
        "--max-time", "45",
        "--connect-timeout", "15",
        "--max-redirs", "0",
        "-D", $headerFile.FullName,
        "-o", $OutputFile,
        "-w", "%{http_code}`n%{url_effective}"
      )
      if ($AllowInsecureLoopback) { $curlArguments += "--insecure" }
      $curlArguments += $current.AbsoluteUri

      $meta = @(& curl.exe @curlArguments)
      if ($LASTEXITCODE -ne 0 -or $meta.Count -lt 2) {
        throw "Request failed: $($current.AbsoluteUri)"
      }

      $statusText = $meta[-2].Trim()
      $effectiveText = $meta[-1].Trim()
      $effective = [Uri]$effectiveText
      Assert-UriBoundary -Uri $effective -Context "$Label effective URL"

      $status = 0
      if (-not [int]::TryParse($statusText, [ref]$status)) {
        throw "Invalid HTTP status: $Label -> $statusText"
      }
      $headers = Get-Content -LiteralPath $headerFile.FullName -Raw

      if ($status -ge 300 -and $status -lt 400) {
        if ($status -notin $allowedRedirectStatuses) {
          throw "Unsupported redirect status: $($current.AbsoluteUri) -> $status"
        }
        if ($hop -ge $maxRedirects) {
          throw "Too many redirects: $Label"
        }
        $locations = [Regex]::Matches($headers, "(?im)^Location:\s*(.+?)\r?$")
        if ($locations.Count -ne 1) {
          throw "Redirect must contain exactly one Location header: $($current.AbsoluteUri)"
        }
        $next = [Uri]::new($current, $locations[0].Groups[1].Value.Trim())
        Assert-UriBoundary -Uri $next -Context "$Label redirect from $($current.AbsoluteUri)"
        $current = $next
        $chain += $current.AbsoluteUri
        continue
      }

      if ($status -ne 200) {
        throw "Final HTTP status is not 200: $Label -> $status"
      }

      return [PSCustomObject]@{
        FinalStatus = $status
        EffectiveUrl = $effective.AbsoluteUri
        Headers = $headers
        Redirects = $chain.Count - 1
        Chain = $chain
      }
    }
    finally {
      Remove-Item -LiteralPath $headerFile.FullName -Force -ErrorAction SilentlyContinue
    }
  }

  throw "Too many redirects: $Label"
}

function Invoke-RelativeResource {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$RelativePath,

    [Parameter(Mandatory = $true)]
    [string]$OutputFile
  )

  $requestUri = Resolve-BaseResource -RelativePath $RelativePath
  $label = if ($RelativePath) { $RelativePath } else { "./" }
  return Invoke-BoundedRequest -RequestUri $requestUri -Label $label -OutputFile $OutputFile
}

function Assert-HstsHeader {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Headers,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $hsts = Get-HeaderValue -Headers $Headers -Name "Strict-Transport-Security"
  if (-not $hsts -or $hsts -notmatch "(?i)(?:^|;)\s*max-age\s*=\s*([1-9][0-9]*)") {
    throw "Missing or ineffective Strict-Transport-Security header: $Label"
  }
}

function Assert-CspPolicy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Policy,

    [Parameter(Mandatory = $true)]
    [string]$Label,

    [switch]$RequireFrameAncestors
  )

  foreach ($required in @(
    "(?:^|;)\s*default-src\s+[^;]*'self'",
    "(?:^|;)\s*script-src\s+[^;]*'self'",
    "(?:^|;)\s*object-src\s+'none'(?:\s|;|$)",
    "(?:^|;)\s*base-uri\s+'self'(?:\s|;|$)"
  )) {
    if ($Policy -notmatch $required) {
      throw "Incomplete Content-Security-Policy ($Label): missing $required"
    }
  }
  if ($RequireFrameAncestors -and $Policy -notmatch "(?:^|;)\s*frame-ancestors\s+'none'(?:\s|;|$)") {
    throw "Incomplete Content-Security-Policy ($Label): missing frame-ancestors 'none'"
  }
}

function Assert-CloudflareSecurityHeaders {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Headers,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Assert-HstsHeader -Headers $Headers -Label $Label
  $csp = Get-HeaderValue -Headers $Headers -Name "Content-Security-Policy"
  if (-not $csp) { throw "Missing required response header ($Label): Content-Security-Policy" }
  Assert-CspPolicy -Policy $csp -Label $Label -RequireFrameAncestors

  $referrer = Get-HeaderValue -Headers $Headers -Name "Referrer-Policy"
  if ($referrer -ne "no-referrer") { throw "Missing or invalid Referrer-Policy header ($Label): expected no-referrer" }
  $nosniff = Get-HeaderValue -Headers $Headers -Name "X-Content-Type-Options"
  if ($nosniff -ne "nosniff") { throw "Missing or invalid X-Content-Type-Options header ($Label): expected nosniff" }
  $frame = Get-HeaderValue -Headers $Headers -Name "X-Frame-Options"
  if ($frame -ne "DENY") { throw "Missing or invalid X-Frame-Options header ($Label): expected DENY" }
}

function Get-MetaContent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Html,

    [string]$Name,
    [string]$HttpEquiv
  )

  $attributePattern = @'
(?<name>[^\s=/>]+)\s*=\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<bare>[^\s>]+))
'@
  foreach ($metaMatch in [Regex]::Matches($Html, "<meta\b[^>]*>", [Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
    $attributes = @{}
    foreach ($attributeMatch in [Regex]::Matches(
      $metaMatch.Value,
      $attributePattern,
      [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )) {
      $attributeName = $attributeMatch.Groups["name"].Value.ToLowerInvariant()
      $attributeValue = if ($attributeMatch.Groups["dq"].Success) {
        $attributeMatch.Groups["dq"].Value
      }
      elseif ($attributeMatch.Groups["sq"].Success) {
        $attributeMatch.Groups["sq"].Value
      }
      else {
        $attributeMatch.Groups["bare"].Value
      }
      $attributes[$attributeName] = $attributeValue
    }

    if ($Name -and $attributes["name"] -and $attributes["name"].Equals($Name, [StringComparison]::OrdinalIgnoreCase)) {
      return [string]$attributes["content"]
    }
    if ($HttpEquiv -and $attributes["http-equiv"] -and $attributes["http-equiv"].Equals($HttpEquiv, [StringComparison]::OrdinalIgnoreCase)) {
      return [string]$attributes["content"]
    }
  }
  return $null
}

function Assert-GitHubPageMetaSecurity {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Html,

    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $referrer = Get-MetaContent -Html $Html -Name "referrer"
  if ($referrer -ne "no-referrer") {
    throw "Missing or invalid referrer meta ($Label): expected no-referrer"
  }
  $csp = Get-MetaContent -Html $Html -HttpEquiv "Content-Security-Policy"
  if (-not $csp) { throw "Missing Content-Security-Policy meta ($Label)" }
  Assert-CspPolicy -Policy $csp -Label "$Label meta"
}

$coreResources = @(
  [PSCustomObject]@{ RelativePath = ""; Kind = "html" },
  [PSCustomObject]@{ RelativePath = "diagnostics.html"; Kind = "html" },
  [PSCustomObject]@{ RelativePath = "privacy.html"; Kind = "html" },
  [PSCustomObject]@{ RelativePath = "sources-and-licenses.html"; Kind = "html" },
  [PSCustomObject]@{ RelativePath = "city-credits.html"; Kind = "html" },
  [PSCustomObject]@{ RelativePath = "city-credits.js"; Kind = "javascript" },
  [PSCustomObject]@{ RelativePath = "public-config.js"; Kind = "javascript" },
  [PSCustomObject]@{ RelativePath = "manifest.webmanifest"; Kind = "manifest" },
  [PSCustomObject]@{ RelativePath = "visuals.js"; Kind = "javascript" }
)

foreach ($resource in $coreResources) {
  $bodyFile = New-TemporaryFile
  try {
    $response = Invoke-RelativeResource -RelativePath $resource.RelativePath -OutputFile $bodyFile.FullName
    $body = Get-Content -LiteralPath $bodyFile.FullName -Raw
    $resultPath = if ($resource.RelativePath) { $resource.RelativePath } else { "./" }
    $results += [PSCustomObject]@{
      Path = $resultPath
      FinalStatus = $response.FinalStatus
      Redirects = $response.Redirects
      EffectiveUrl = $response.EffectiveUrl
    }
    if ($resource.Kind -eq "html") {
      $pageResponses[$resource.RelativePath] = $response
      $pageBodies[$resource.RelativePath] = $body
    }
    if ($resource.RelativePath -eq "public-config.js") { $publicConfigBody = $body }
    if ($resource.RelativePath -eq "manifest.webmanifest") {
      $manifestBody = $body
      $manifestResponse = $response
    }
  }
  finally {
    Remove-Item -LiteralPath $bodyFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

if ($HostingProfile -eq "CloudflarePages") {
  foreach ($page in @("", "diagnostics.html", "privacy.html", "sources-and-licenses.html", "city-credits.html")) {
    $pageLabel = if ($page) { $page } else { "./" }
    Assert-CloudflareSecurityHeaders -Headers $pageResponses[$page].Headers -Label $pageLabel
  }
}
else {
  Assert-HstsHeader -Headers $pageResponses[""].Headers -Label "GitHub Pages homepage"
  Assert-GitHubPageMetaSecurity -Html $pageBodies[""] -Label "index"
  Assert-GitHubPageMetaSecurity -Html $pageBodies["diagnostics.html"] -Label "diagnostics"
  Assert-GitHubPageMetaSecurity -Html $pageBodies["privacy.html"] -Label "privacy"
  Assert-GitHubPageMetaSecurity -Html $pageBodies["sources-and-licenses.html"] -Label "sources-and-licenses"
  Assert-GitHubPageMetaSecurity -Html $pageBodies["city-credits.html"] -Label "city-credits"
  Write-Host "NOTE: GitHub Pages does not enforce a repository _headers file; platform HSTS plus every public HTML page's meta CSP and referrer policy were verified instead."
}

if ($pageBodies["city-credits.html"] -notmatch 'id\s*=\s*["'']cityCreditList["'']' -or $pageBodies["city-credits.html"] -notmatch '(?:src\s*=\s*["'']\./city-credits\.js["'']|城市图署名与许可清单)') {
  throw "city-credits.html resolved to an unrelated HTML document or SPA fallback."
}

foreach ($check in @(
  [PSCustomObject]@{ Label = "schemaVersion: 2"; Pattern = 'schemaVersion\s*:\s*2(?:\s*[,}])' },
  [PSCustomObject]@{ Label = 'appVersion: "2.4.2"'; Pattern = 'appVersion\s*:\s*["'']2\.4\.2["'']' },
  [PSCustomObject]@{ Label = "publicReleaseMode: true"; Pattern = 'publicReleaseMode\s*:\s*true(?:\s*[,}])' },
  [PSCustomObject]@{ Label = "publicSafeMode: false"; Pattern = 'publicSafeMode\s*:\s*false(?:\s*[,}])' },
  [PSCustomObject]@{ Label = "remoteBookMovieImages: true"; Pattern = 'remoteBookMovieImages\s*:\s*true(?:\s*[,}])' },
  [PSCustomObject]@{ Label = "localCityImages: true"; Pattern = 'localCityImages\s*:\s*true(?:\s*[,}])' }
)) {
  if ($publicConfigBody -notmatch $check.Pattern) {
    throw "public-config.js is missing v2.4 release contract: $($check.Label)"
  }
}

try {
  $manifest = $manifestBody | ConvertFrom-Json
}
catch {
  throw "manifest.webmanifest is not valid JSON: $($_.Exception.Message)"
}

$manifestUri = [Uri]$manifestResponse.EffectiveUrl
$resolvedManifestValues = @{}
foreach ($field in @("id", "start_url", "scope")) {
  if ($manifest.PSObject.Properties.Name -notcontains $field -or -not ($manifest.$field -is [string]) -or -not $manifest.$field) {
    throw "manifest.webmanifest must define a non-empty string '$field'."
  }
  $resolved = [Uri]::new($manifestUri, [string]$manifest.$field)
  Assert-UriBoundary -Uri $resolved -Context "manifest.$field"
  $resolvedManifestValues[$field] = $resolved
}

$scopePath = [Uri]::UnescapeDataString($resolvedManifestValues["scope"].AbsolutePath.Replace("\", "/"))
if (-not $scopePath.EndsWith("/")) { $scopePath += "/" }
$startPath = [Uri]::UnescapeDataString($resolvedManifestValues["start_url"].AbsolutePath.Replace("\", "/"))
if (-not $startPath.StartsWith($scopePath, [StringComparison]::Ordinal)) {
  throw "manifest.start_url escapes manifest.scope: $($resolvedManifestValues['start_url']) vs $($resolvedManifestValues['scope'])"
}

$resolvedStatic = Resolve-Path -LiteralPath $StaticDirectory
function Compare-LocalAndRemoteFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RelativePath,

    [switch]$AlreadyRequested,

    [string]$ExpectedContentTypePattern,

    [long]$ExpectedBytes = -1
  )

  $localPath = Join-Path $resolvedStatic.Path ($RelativePath.Replace("/", [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $localPath -PathType Leaf)) {
    throw "Missing local comparison file: $localPath"
  }
  $remoteFile = New-TemporaryFile
  try {
    $response = Invoke-RelativeResource -RelativePath $RelativePath -OutputFile $remoteFile.FullName
    if ($ExpectedBytes -ge 0) {
      $localBytes = (Get-Item -LiteralPath $localPath).Length
      $remoteBytes = (Get-Item -LiteralPath $remoteFile.FullName).Length
      if ($localBytes -ne $ExpectedBytes) {
        throw "$RelativePath local byte length mismatch: declared=$ExpectedBytes actual=$localBytes"
      }
      if ($remoteBytes -ne $ExpectedBytes) {
        throw "$RelativePath remote byte length mismatch: declared=$ExpectedBytes actual=$remoteBytes"
      }
    }
    $localHash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash
    $remoteHash = (Get-FileHash -LiteralPath $remoteFile.FullName -Algorithm SHA256).Hash
    if ($localHash -ne $remoteHash) {
      throw "$RelativePath SHA-256 mismatch: local=$localHash remote=$remoteHash"
    }
    if ($ExpectedContentTypePattern) {
      $contentType = Get-HeaderValue -Headers $response.Headers -Name "Content-Type"
      if (-not $contentType -or $contentType -notmatch $ExpectedContentTypePattern) {
        throw "$RelativePath has invalid Content-Type '$contentType'; expected $ExpectedContentTypePattern"
      }
    }
    if (-not $AlreadyRequested) {
      $script:results += [PSCustomObject]@{
        Path = $RelativePath
        FinalStatus = $response.FinalStatus
        Redirects = $response.Redirects
        EffectiveUrl = $response.EffectiveUrl
      }
    }
  }
  finally {
    Remove-Item -LiteralPath $remoteFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

$runtimeChainFiles = @(
  "index.html",
  "styles.css",
  "public-config.js",
  "runtime-health.js",
  "bootstrap.js",
  "asset-routing.js",
  "catalog-loader.js",
  "catalog.js",
  "engine.js",
  "state.js",
  "profile.js",
  "lock.js",
  "backup.js",
  "backup-crypto.js",
  "appearance.js",
  "explore.js",
  "weekly.js",
  "music.js",
  "speech.js",
  "city-live.js",
  "reminders.js",
  "visuals.js",
  "pwa.js",
  "app.js",
  "search-worker.js",
  "diagnostics.html",
  "diagnostics.css",
  "diagnostics.js",
  "privacy.html",
  "sources-and-licenses.html",
  "city-credits.html",
  "city-credits.js",
  "legal.css",
  "manifest.webmanifest",
  "sw.js",
  "assets/favicon.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/visuals/manifest.js",
  "assets/visuals/cities/manifest.json",
  "catalog-data/manifest.js",
  "catalog-data/manifest.json",
  "assets/medical/manifest.json",
  "assets/audio/german/manifest.json"
)

foreach ($runtimeFile in $runtimeChainFiles) {
  $alreadyRequested = $runtimeFile -in @("public-config.js", "manifest.webmanifest", "visuals.js", "diagnostics.html", "privacy.html", "sources-and-licenses.html", "city-credits.html", "city-credits.js")
  Compare-LocalAndRemoteFile -RelativePath $runtimeFile -AlreadyRequested:$alreadyRequested
}

$catalogManifestLocal = Join-Path $resolvedStatic.Path "catalog-data\manifest.json"
try {
  $catalogManifest = Get-Content -LiteralPath $catalogManifestLocal -Raw | ConvertFrom-Json
}
catch {
  throw "Local catalog-data/manifest.json is invalid JSON: $($_.Exception.Message)"
}
if ($catalogManifest.appVersion -ne "2.4.2") {
  throw "catalog-data/manifest.json appVersion must be 2.4.2."
}
$selectionDataPath = [string]$catalogManifest.selectionData.path
if (-not $selectionDataPath -or $selectionDataPath -notmatch '^selection-data\.[a-f0-9]{12}\.json$') {
  throw "catalog-data/manifest.json has an unsafe or invalid selectionData.path: $selectionDataPath"
}
Compare-LocalAndRemoteFile -RelativePath "catalog-data/$selectionDataPath"
try {
  $selectionDataLocal = Join-Path $resolvedStatic.Path ("catalog-data/$selectionDataPath".Replace("/", [IO.Path]::DirectorySeparatorChar))
  $selectionData = Get-Content -LiteralPath $selectionDataLocal -Raw | ConvertFrom-Json
}
catch {
  throw "Local catalog selection data is invalid JSON: $($_.Exception.Message)"
}
$catalogCityRows = @($selectionData.rows.city)
if ($catalogCityRows.Count -ne 200) {
  throw "Catalog selection data must contain exactly 200 city rows; found $($catalogCityRows.Count)."
}
$catalogCityIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($catalogCityRow in $catalogCityRows) {
  $catalogCityId = [string]$catalogCityRow[0]
  if ($catalogCityId -notmatch '^city-[a-z0-9]+(?:-[a-z0-9]+)*$' -or -not $catalogCityIds.Add($catalogCityId)) {
    throw "Catalog selection data contains an invalid or duplicate city id: $catalogCityId"
  }
}

$cityManifestRelative = "assets/visuals/cities/manifest.js"
$cityManifestLocal = Join-Path $resolvedStatic.Path ($cityManifestRelative.Replace("/", [IO.Path]::DirectorySeparatorChar))
if (-not (Test-Path -LiteralPath $cityManifestLocal -PathType Leaf)) {
  throw "Missing required city runtime manifest: $cityManifestLocal"
}
Compare-LocalAndRemoteFile -RelativePath $cityManifestRelative
$cityManifestText = Get-Content -LiteralPath $cityManifestLocal -Raw
$cityPayloadMatch = [Regex]::Match(
  $cityManifestText,
  'DAILY_ATLAS_CITY_VISUALS\s*=\s*(?<json>\{.*\})\s*;\s*\}\)',
  [Text.RegularExpressions.RegexOptions]::Singleline
)
if (-not $cityPayloadMatch.Success) {
  throw "assets/visuals/cities/manifest.js does not expose a parseable DAILY_ATLAS_CITY_VISUALS payload."
}
try {
  $cityManifest = $cityPayloadMatch.Groups["json"].Value | ConvertFrom-Json
}
catch {
  throw "assets/visuals/cities/manifest.js payload is invalid JSON: $($_.Exception.Message)"
}
if ($cityManifest.schemaVersion -ne 1 -or $cityManifest.count -ne 200 -or @($cityManifest.items).Count -ne 200) {
  throw "City manifest contract requires schemaVersion=1, count=200 and exactly 200 items."
}
$cityManifestJsonLocal = Join-Path $resolvedStatic.Path "assets\visuals\cities\manifest.json"
try {
  $cityManifestJson = Get-Content -LiteralPath $cityManifestJsonLocal -Raw | ConvertFrom-Json
}
catch {
  throw "assets/visuals/cities/manifest.json is invalid JSON: $($_.Exception.Message)"
}
if (($cityManifest | ConvertTo-Json -Depth 20 -Compress) -cne ($cityManifestJson | ConvertTo-Json -Depth 20 -Compress)) {
  throw "City manifest JSON/JS payloads are not identical."
}

$cityDirectory = Join-Path $resolvedStatic.Path "assets\visuals\cities"
$expectedCityNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$seenCityIds = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($cityItem in @($cityManifest.items)) {
  $cityId = [string]$cityItem.id
  $cityPath = ([string]$cityItem.path).Replace("\", "/")
  $cityHash = ([string]$cityItem.sha256).ToUpperInvariant()
  if ($cityId -notmatch '^city-[a-z0-9]+(?:-[a-z0-9]+)*$' -or -not $seenCityIds.Add($cityId)) {
    throw "City manifest contains an invalid or duplicate id: $cityId"
  }
  $expectedPath = "./assets/visuals/cities/$cityId.webp"
  if ($cityPath -cne $expectedPath) {
    throw "City manifest path does not match its stable id: $cityId -> $cityPath"
  }
  if ($cityHash -notmatch '^[A-F0-9]{64}$') {
    throw "City manifest contains an invalid SHA-256: $cityId"
  }
  $declaredBytesText = [Convert]::ToString($cityItem.bytes, [Globalization.CultureInfo]::InvariantCulture)
  if ($declaredBytesText -notmatch '^[1-9][0-9]*$') {
    throw "City manifest bytes must be a positive safe integer: $cityId"
  }
  $declaredBytes = 0L
  if (-not [long]::TryParse($declaredBytesText, [Globalization.NumberStyles]::None, [Globalization.CultureInfo]::InvariantCulture, [ref]$declaredBytes) -or $declaredBytes -gt 9007199254740991) {
    throw "City manifest bytes must be a positive safe integer: $cityId"
  }
  if ([int]$cityItem.width -ne 960 -or [int]$cityItem.height -ne 540) {
    throw "City manifest dimensions must be exactly 960x540: $cityId"
  }
  [void]$expectedCityNames.Add("$cityId.webp")
  $relativeWithoutDot = $cityPath.Substring(2)
  $localCityPath = Join-Path $resolvedStatic.Path ($relativeWithoutDot.Replace("/", [IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $localCityPath -PathType Leaf)) {
    throw "City manifest references a missing local image: $relativeWithoutDot"
  }
  $bytes = [IO.File]::ReadAllBytes($localCityPath)
  if ($bytes.LongLength -ne $declaredBytes) {
    throw "City manifest local byte length mismatch: $relativeWithoutDot declared=$declaredBytes actual=$($bytes.LongLength)"
  }
  if ($bytes.Length -lt 12 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne "RIFF" -or [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -ne "WEBP") {
    throw "City asset is not a WebP RIFF payload: $relativeWithoutDot"
  }
  $actualCityHash = (Get-FileHash -LiteralPath $localCityPath -Algorithm SHA256).Hash
  if ($actualCityHash -ne $cityHash) {
    throw "City manifest SHA-256 mismatch: $relativeWithoutDot declared=$cityHash actual=$actualCityHash"
  }
}

if ($seenCityIds.Count -ne $catalogCityIds.Count) {
  throw "City manifest and catalog stable-id sets differ in size."
}
foreach ($catalogCityId in $catalogCityIds) {
  if (-not $seenCityIds.Contains($catalogCityId)) {
    throw "City manifest is missing catalog stable id: $catalogCityId"
  }
}

$combinedManifestLocal = Join-Path $resolvedStatic.Path "assets\visuals\manifest.js"
$combinedManifestText = Get-Content -LiteralPath $combinedManifestLocal -Raw
$combinedPayloadMatch = [Regex]::Match(
  $combinedManifestText,
  'DAILY_ATLAS_VISUAL_MANIFEST\s*=\s*(?<json>\{.*\})\s*;\s*\}\)',
  [Text.RegularExpressions.RegexOptions]::Singleline
)
if (-not $combinedPayloadMatch.Success) {
  throw "assets/visuals/manifest.js does not expose a parseable DAILY_ATLAS_VISUAL_MANIFEST payload."
}
try {
  $combinedManifest = $combinedPayloadMatch.Groups["json"].Value | ConvertFrom-Json
}
catch {
  throw "assets/visuals/manifest.js payload is invalid JSON: $($_.Exception.Message)"
}
$combinedCities = @($combinedManifest.items | Where-Object { $_.type -eq "city" })
if ($combinedCities.Count -ne 200) {
  throw "Combined visual manifest must contain exactly 200 city items; found $($combinedCities.Count)."
}
$combinedById = @{}
foreach ($combinedCity in $combinedCities) {
  $combinedId = [string]$combinedCity.id
  if ($combinedById.ContainsKey($combinedId)) {
    throw "Combined visual manifest contains a duplicate city id: $combinedId"
  }
  $combinedById[$combinedId] = $combinedCity
}
foreach ($cityItem in @($cityManifest.items)) {
  $cityId = [string]$cityItem.id
  if (-not $combinedById.ContainsKey($cityId)) {
    throw "Combined visual manifest is missing city id: $cityId"
  }
  $combinedCity = $combinedById[$cityId]
  $expectedLocal = ([string]$cityItem.path).Substring(2)
  if ([string]$combinedCity.status -ne "approved-open-license-local" -or [string]$combinedCity.localFile -cne $expectedLocal) {
    throw "Combined visual manifest has a non-approved or mismatched local city route: $cityId"
  }
  if ([string]$combinedCity.audit.local.sha256 -cne [string]$cityItem.sha256 -or [int]$combinedCity.audit.local.width -ne 960 -or [int]$combinedCity.audit.local.height -ne 540 -or [long]$combinedCity.audit.local.bytes -ne [long]$cityItem.bytes) {
    throw "Combined visual manifest audit does not match the city runtime manifest: $cityId"
  }
}

$actualCityNames = @(Get-ChildItem -LiteralPath $cityDirectory -File -Filter "*.webp" | ForEach-Object { $_.Name })
if ($actualCityNames.Count -ne 200) {
  throw "City asset directory must contain exactly 200 WebP files; found $($actualCityNames.Count)."
}
foreach ($actualCityName in $actualCityNames) {
  if (-not $expectedCityNames.Contains($actualCityName)) {
    throw "City asset directory contains an unmanifested WebP file: $actualCityName"
  }
}

foreach ($cityItem in @($cityManifest.items)) {
  $cityRelative = ([string]$cityItem.path).Substring(2)
  Compare-LocalAndRemoteFile -RelativePath $cityRelative -AlreadyRequested -ExpectedContentTypePattern '^image/webp(?:\s*;|$)' -ExpectedBytes ([long]$cityItem.bytes)
}

$results | Format-Table -AutoSize
Write-Host "PASS: $HostingProfile BaseUrl=$($baseUri.AbsoluteUri); HTTPS, authority, base-path redirects, v2.4 config, runtime-chain hashes, catalog/visual stable IDs, JSON/JS manifests and the exact 200-city 960x540 WebP hash/byte closure verified."
