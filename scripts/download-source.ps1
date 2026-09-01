param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$headers = @{
  "Accept" = "application/json, application/octet-stream;q=0.9, */*;q=0.8"
  "User-Agent" = "DailyAtlasCurator/2.0 (offline educational prototype)"
}
$response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $headers -OutFile $OutputPath -TimeoutSec 90
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
@{
  effectiveUrl = $response.BaseResponse.ResponseUri.AbsoluteUri
  status = [int]$response.StatusCode
} | ConvertTo-Json -Compress
