param([string]$Evidence)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$runId=[guid]::NewGuid().ToString('N')
if(!$Evidence){$Evidence=Join-Path ([IO.Path]::GetTempPath()) ('yavc-obsidian-acceptance-'+$runId)}
$evidencePath=[IO.Path]::GetFullPath($Evidence)
if(Test-Path -LiteralPath $evidencePath){throw 'Choose a fresh evidence directory; earlier runs are retained.'}
New-Item -ItemType Directory -Path $evidencePath | Out-Null
$inputPath=Join-Path $evidencePath 'input';$outputPath=Join-Path $evidencePath 'output'
New-Item -ItemType Directory -Path $outputPath | Out-Null
& node (Join-Path $PSScriptRoot 'obsidian-proof/prepare.cjs') $inputPath
if($LASTEXITCODE -ne 0){throw 'Canvas proof preparation failed.'}
$imageFile=Join-Path $evidencePath 'image-id.txt';$buildLog=Join-Path $evidencePath 'build.log'
& docker build --platform linux/amd64 --iidfile $imageFile -t yavc-obsidian-proof:1.15.0 (Join-Path $PSScriptRoot 'obsidian-proof') *> $buildLog
if($LASTEXITCODE -ne 0){Get-Content -LiteralPath $buildLog -Tail 25;throw 'The isolated Obsidian appliance could not build.'}
$imageId=(Get-Content -Raw -LiteralPath $imageFile).Trim()
if($imageId -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Docker returned an invalid immutable image identity.'}
$container='yavc-obsidian-'+$runId
$sourceCommit=(& git -C $taskRoot rev-parse HEAD).Trim()
$sourceDirty=[bool](& git -C $taskRoot status --porcelain)
$sources=@{}
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'obsidian-proof') -File | ForEach-Object {$sources[$_.Name]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
try{
    & docker run --rm --name $container --label ('yavc.acceptance.run='+$runId) --platform linux/amd64 --network none --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --shm-size 256m --memory 2g --cpus 2 --mount ('type=bind,src='+$outputPath+',dst=/evidence') --mount ('type=bind,src='+$inputPath+',dst=/input,readonly') $imageId *> (Join-Path $evidencePath 'run.log')
    $exitCode=$LASTEXITCODE
    $resultPath=Join-Path $outputPath 'acceptance.json'
    if(!(Test-Path -LiteralPath $resultPath)){throw 'The native app did not produce an acceptance receipt. Inspect run.log.'}
    $result=Get-Content -Raw -LiteralPath $resultPath | ConvertFrom-Json
    $manifest=Get-Content -Raw -LiteralPath (Join-Path $inputPath 'manifest.json') | ConvertFrom-Json
    if($exitCode -ne 0 -or !$result.ok -or $result.inputDigest -ne $manifest.digest){Get-Content -LiteralPath (Join-Path $evidencePath 'run.log') -Tail 25;throw 'Native Canvas compatibility did not pass. All evidence was retained.'}
    @{sourceCommit=$sourceCommit;sourceDirty=$sourceDirty;image=$imageId;runId=$runId;network='none';personalStateMounted=$false;inputDigest=$manifest.digest;harness=$sources;result=$result} | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $evidencePath 'receipt.json')
    Write-Output ('Actual Obsidian Canvas round trip passed. Evidence: '+$evidencePath)
}finally{
    $label=& docker container inspect $container --format '{{index .Config.Labels "yavc.acceptance.run"}}' 2>$null
    if($LASTEXITCODE -eq 0 -and $label -eq $runId){& docker rm --force $container | Out-Null}
}
