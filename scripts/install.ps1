param(
    [switch]$Background
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js 22 or newer is required. Please install it first and rerun this script."
    exit 1
}

$nodeVersion = (node -p "process.versions.node")
$nodeMajor = [int]$nodeVersion.Split('.')[0]
$requiredMajor = 22

if ($nodeMajor -lt $requiredMajor) {
    Write-Error "Node.js version $requiredMajor+ is required, but found $nodeVersion. Please update Node.js and rerun this script."
    exit 1
}

Write-Host "Using Node.js $nodeVersion"
Push-Location $projectRoot
Write-Host "Installing project dependencies..."
npm install
Pop-Location

if ($Background) {
    $logDir = Join-Path $projectRoot 'logs'
    $null = New-Item -ItemType Directory -Path $logDir -Force
    $logFile = Join-Path $logDir '3d-pcc.log'

    Write-Host "Starting app in the background..."
    Start-Process -FilePath "npm" -ArgumentList "run","start" -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $logFile
    Write-Host "The app is running in the background."
    Write-Host "Log file: $logFile"
    exit 0
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Start the app with: npm run dev"
Write-Host "Or for production: npm run start:production"
Write-Host "Or run in the background: .\scripts\install.ps1 -Background"
