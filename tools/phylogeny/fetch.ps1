$ErrorActionPreference = 'Stop'
$datasetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../data/phylogeny'))
$manifest = Get-Content -LiteralPath (Join-Path $datasetRoot 'manifest.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path (Join-Path $datasetRoot 'upstream') | Out-Null
foreach ($entry in $manifest.files) {
  if ($entry.file -notin @('upstream/opentree16.1_tree.tgz', 'upstream/ott3.7.3.tgz', 'upstream/ott-properties.json', 'upstream/synthesis-index.html')) { continue }
  $targetPath = [IO.Path]::GetFullPath((Join-Path $datasetRoot $entry.file))
  if (-not $targetPath.StartsWith($datasetRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Download path escaped dataset directory' }
  if (-not (Test-Path -LiteralPath $targetPath)) { Invoke-WebRequest -Uri $entry.url -OutFile $targetPath }
  $actualHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $entry.sha256) { throw "Upstream SHA256 mismatch: $($entry.file)" }
}
& tar -xzf (Join-Path $datasetRoot 'upstream/opentree16.1_tree.tgz') -C (Join-Path $datasetRoot 'upstream')
if ($LASTEXITCODE -ne 0) { throw 'Synthetic tree extraction failed' }
& tar -xzf (Join-Path $datasetRoot 'upstream/ott3.7.3.tgz') -C (Join-Path $datasetRoot 'upstream')
if ($LASTEXITCODE -ne 0) { throw 'Taxonomy extraction failed' }
Write-Output 'Pinned OpenTree and OTT archives verified and extracted.'
