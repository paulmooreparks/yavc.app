param(
    [Parameter(Mandatory=$true)][string]$Receiver,
    [Parameter(Mandatory=$true)][string]$Artifact,
    [Parameter(Mandatory=$true)][string]$Proof,
    [Parameter(Mandatory=$true)][string]$Extension,
    [switch]$Prepared
)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$receiverPath=(Resolve-Path -LiteralPath $Receiver).Path
$artifactPath=(Resolve-Path -LiteralPath $Artifact).Path
$source=(& git -C $receiverPath rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $source -ne 'ba2b8b72008e53fc1b8601f5d903ce95fa53558d'){throw 'Receiving source differs from the reviewed baseline.'}
$status=& git -C $receiverPath status --porcelain
if($LASTEXITCODE -ne 0 -or $status){throw 'The receiving proof checkout must be clean.'}
if(!$Prepared){
    & node (Join-Path $PSScriptRoot 'prepare-dinah-content-proof.cjs') $receiverPath $artifactPath $Proof
    if($LASTEXITCODE -ne 0){throw 'Native proof preparation failed.'}
}
& node (Join-Path $PSScriptRoot 'prepare-dinah-content-proof.cjs') $receiverPath $artifactPath $Proof --verify
if($LASTEXITCODE -ne 0){throw 'Prepared proof verification failed.'}
$proofPath=(Resolve-Path -LiteralPath $Proof).Path
$extensionPath=(Resolve-Path -LiteralPath $Extension).Path
$extensionSource=(& git -C $extensionPath rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $extensionSource -ne '444129580fb6f8f8d3ce3248a09f8df97c6699ac'){throw 'Extension source differs from the reviewed baseline.'}
$extensionStatus=& git -C $extensionPath status --porcelain
if($LASTEXITCODE -ne 0 -or $extensionStatus){throw 'The extension proof checkout must be clean.'}
$module=Get-Content -Raw -LiteralPath (Join-Path $receiverPath 'go.mod')
$old='replace github.com/paulmooreparks/dinah-extension-go => ../dinah-extension-go'
if(!$module.Contains($old)){throw 'The receiving local-module seam changed.'}
$module=$module.Replace($old,('replace github.com/paulmooreparks/dinah-extension-go => "'+$extensionPath.Replace('\','/')+'"'))
$modulePath=Join-Path $proofPath 'dinah-proof.mod'
Set-Content -LiteralPath $modulePath -Value $module
Copy-Item -LiteralPath (Join-Path $receiverPath 'go.sum') -Destination (Join-Path $proofPath 'dinah-proof.sum')
Push-Location $receiverPath
try{
    & pwsh -NoProfile -File scripts/with-test-lock.ps1 go build -tags desktop,production -overlay (Join-Path $proofPath 'overlay.json') -modfile $modulePath -buildvcs=false -ldflags '-H windowsgui -s -w -X main.appVersion=yavc-content-proof' -o (Join-Path $proofPath 'dinah-content-proof.exe') ./cmd/dinah-desktop
    if($LASTEXITCODE -ne 0){throw 'Native proof build failed.'}
}finally{Pop-Location}
@{receiver=$source;extension=(& git -C $extensionPath rev-parse HEAD).Trim();artifact=$artifactPath;proof=$proofPath;executableSha256=(Get-FileHash -LiteralPath (Join-Path $proofPath 'dinah-content-proof.exe') -Algorithm SHA256).Hash;producer=(& git -C $taskRoot rev-parse HEAD).Trim()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $proofPath 'build.json')
Write-Output "Built isolated native proof at $proofPath"
