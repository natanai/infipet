param(
    [ValidateSet('web', 'iphone')]
    [string]$Mode = 'web'
)

$ErrorActionPreference = 'Stop'
$taskNode = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $taskNode) {
    $taskNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $taskNode)) {
    throw 'Node.js is required. Install the current Node.js LTS release, then try again.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'node_modules\expo\bin\cli')) {
        throw 'Install dependencies first: pnpm install'
    }
    if ($Mode -eq 'iphone') {
        & $taskNode 'node_modules/expo/bin/cli' start --go --lan --port 8081
    } else {
        & $taskNode 'node_modules/expo/bin/cli' start --go --web --port 8081
    }
} finally {
    Pop-Location
}
