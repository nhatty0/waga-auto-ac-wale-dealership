<#
.SYNOPSIS
  Local dev stack for AC WALE MARKET: FastAPI backend on :8000 + Next.js frontend on :3000.

.EXAMPLE
  .\dev.ps1 start      # start both in the background (logs in .dev\)
  .\dev.ps1 otp        # show the latest login codes (SMS is OFF locally; codes are only logged)
  .\dev.ps1 status     # is everything up?
  .\dev.ps1 logs       # follow the backend log (Ctrl+C to stop following)
  .\dev.ps1 stop       # stop both
  .\dev.ps1 restart

  If Windows blocks scripts:  powershell -ExecutionPolicy Bypass -File .\dev.ps1 start

.NOTES
  - Uses the LOCAL database backend\ac_wale_cars.db (DATABASE_URL is forced; never production).
  - ENABLE_SMS_DISPATCH=false: OTP codes are printed to .dev\backend.log, no SMS is sent.
  - SUPERADMIN_PHONE=251900061300,251918032065 (owners) for this run only. backend\.env is not edited.
  - Telegram is OFF by default (no poller, no bot token) so localhost never messages the real bot.
    Pass -Telegram to keep the bot token from backend\.env.
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet("start", "stop", "restart", "status", "otp", "logs")]
  [string]$Command = "status",
  [switch]$Telegram
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$DevDir = Join-Path $Root ".dev"
$PidFile = Join-Path $DevDir "pids.json"
$BackendLog = Join-Path $DevDir "backend.log"
$BackendOut = Join-Path $DevDir "backend.out.log"
$FrontendLog = Join-Path $DevDir "frontend.log"
$FrontendErr = Join-Path $DevDir "frontend.err.log"

function Test-Port([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Url([string]$Url, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 800
  }
  return $false
}

function Start-Dev {
  New-Item -ItemType Directory -Force $DevDir | Out-Null
  $pids = @{}

  # ---------- Backend ----------
  if (Test-Port 8000) {
    Write-Host "Backend: something already listens on :8000 (left as is)." -ForegroundColor Yellow
  } else {
    $python = Join-Path $Backend "venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
      Write-Host "Creating backend venv + installing requirements (first run only)..." -ForegroundColor Cyan
      Push-Location $Backend
      python -m venv venv
      & $python -m pip install -q -r requirements.txt
      Pop-Location
    }
    $vars = @{
      "DATABASE_URL"        = "sqlite:///./ac_wale_cars.db"
      "ENABLE_SMS_DISPATCH" = "false"
      "SUPERADMIN_PHONE"    = "251900061300,251918032065"
      "TESTING"             = "true"           # disables the Telegram getUpdates poller
      "PYTHONIOENCODING"    = "utf-8"          # emoji in logs would crash a redirected console
      "PYTHONUNBUFFERED"    = "1"
    }
    if (-not $Telegram) {
      # A single space: PowerShell 5.1 deletes a variable set to "", and then backend\.env would
      # fill it in. The backend strips it to "" = no bot token = no real Telegram messages.
      $vars["TELEGRAM_PLATFORM_BOT_TOKEN"] = " "
      $vars["TELEGRAM_BOT_TOKEN"] = " "
    }
    $saved = @{}
    foreach ($k in $vars.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k, "Process"); [Environment]::SetEnvironmentVariable($k, $vars[$k], "Process") }
    try {
      $p = Start-Process -FilePath $python `
        -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $Backend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $BackendOut -RedirectStandardError $BackendLog
      $pids["backend"] = $p.Id
    } finally {
      foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], "Process") }
    }
    Write-Host "Backend starting (pid $($p.Id))..." -ForegroundColor Cyan
  }

  # ---------- Frontend ----------
  if (Test-Port 3000) {
    Write-Host "Frontend: something already listens on :3000 (left as is)." -ForegroundColor Yellow
  } else {
    if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
      Write-Host "Installing frontend packages (first run only)..." -ForegroundColor Cyan
      Push-Location $Frontend; npm install; Pop-Location
    }
    $envLocal = Join-Path $Frontend ".env.development.local"
    if (-not (Test-Path $envLocal)) {
      # Git-ignored (frontend/.gitignore has .env*). Points the dev server at the local backend.
      "BACKEND_URL=http://127.0.0.1:8000`nINTERNAL_API_URL=http://127.0.0.1:8000`nNEXT_PUBLIC_API_URL=`n" |
        Set-Content -Path $envLocal -Encoding ascii
    }
    $saved = @{ "BACKEND_URL" = $env:BACKEND_URL; "INTERNAL_API_URL" = $env:INTERNAL_API_URL }
    $env:BACKEND_URL = "http://127.0.0.1:8000"
    $env:INTERNAL_API_URL = "http://127.0.0.1:8000"
    try {
      $f = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "-p", "3000" `
        -WorkingDirectory $Frontend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendErr
      $pids["frontend"] = $f.Id
    } finally {
      $env:BACKEND_URL = $saved["BACKEND_URL"]; $env:INTERNAL_API_URL = $saved["INTERNAL_API_URL"]
    }
    Write-Host "Frontend starting (pid $($f.Id))..." -ForegroundColor Cyan
  }

  if ($pids.Count -gt 0) {
    $old = @{}
    if (Test-Path $PidFile) { (Get-Content $PidFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $old[$_.Name] = $_.Value } }
    foreach ($k in $pids.Keys) { $old[$k] = $pids[$k] }
    $old | ConvertTo-Json | Set-Content $PidFile
  }

  $okB = Wait-Url "http://127.0.0.1:8000/docs" 90
  $okF = Wait-Url "http://localhost:3000/admin" 120
  Show-Status
  if (-not $okB) { Write-Host "Backend did not answer; see $BackendLog" -ForegroundColor Red }
  if (-not $okF) { Write-Host "Frontend did not answer; see $FrontendLog / $FrontendErr" -ForegroundColor Red }
}

function Stop-Dev {
  $stopped = $false
  if (Test-Path $PidFile) {
    (Get-Content $PidFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object {
      # /T kills the whole tree: uvicorn --reload and npm both spawn child processes.
      & taskkill.exe /PID $_.Value /T /F 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Write-Host "Stopped $($_.Name) (pid $($_.Value))"; $stopped = $true }
    }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
  }
  # Fallback: python/node processes still listening on our ports (e.g. started by hand).
  foreach ($port in 8000, 3000) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
      if ($proc -and @("python", "node") -contains $proc.ProcessName) {
        & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
        Write-Host "Stopped $($proc.ProcessName) on :$port (pid $($proc.Id))"; $stopped = $true
      }
    }
  }
  if (-not $stopped) { Write-Host "Nothing was running." }
}

function Show-Status {
  $b = if (Test-Port 8000) { "UP   http://127.0.0.1:8000/docs" } else { "DOWN" }
  $f = if (Test-Port 3000) { "UP   http://localhost:3000  (admin: /admin, owner: /superadmin)" } else { "DOWN" }
  Write-Host ""
  Write-Host "Backend : $b"
  Write-Host "Frontend: $f"
  Write-Host "Logs    : .dev\backend.log (OTP codes here), .dev\frontend.log"
  Write-Host "Login code: .\dev.ps1 otp"
}

function Show-Otp {
  if (-not (Test-Path $BackendLog)) { Write-Host "No backend log yet. Start with .\dev.ps1 start"; return }
  $hits = Select-String -Path $BackendLog -Pattern "\[MOCK SMS\]" -Encoding UTF8 | Select-Object -Last 5
  if (-not $hits) { Write-Host "No codes yet. Request one on http://localhost:3000/admin first."; return }
  foreach ($h in $hits) {
    if ($h.Line -match "to (\d+): OTP=(\d{6})") { Write-Host ("{0}  ->  {1}" -f $Matches[1], $Matches[2]) -ForegroundColor Green }
    else { Write-Host $h.Line }
  }
  Write-Host "(newest last; codes expire after 3 minutes)"
}

switch ($Command) {
  "start" { Start-Dev }
  "stop" { Stop-Dev }
  "restart" { Stop-Dev; Start-Sleep -Seconds 1; Start-Dev }
  "status" { Show-Status }
  "otp" { Show-Otp }
  "logs" { if (Test-Path $BackendLog) { Get-Content $BackendLog -Tail 40 -Wait -Encoding UTF8 } else { Write-Host "No backend log yet." } }
}
