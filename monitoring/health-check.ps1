# health-check.ps1 — Kiem tra tinh trang Soul Diary (pm2 + HTTP + log loi)
# Khong dung AI/Claude — script thuan PowerShell, chay qua Windows Task Scheduler, hoan toan mien phi.
# Ghi ket qua vao health-check.log moi lan chay; gui email canh bao neu phat hien van de.

$ErrorActionPreference = 'Stop'

$RepoRoot   = 'C:\Users\Administrator\Desktop\nhat-ky-fullstack'
$LogFile    = Join-Path $RepoRoot 'monitoring\health-check.log'
$StateFile  = Join-Path $RepoRoot 'monitoring\health-check-state.json'
$ErrLogPath = 'C:\Users\Administrator\.pm2\logs\souldiary-api-error.log'
$EnvFile    = Join-Path $RepoRoot 'backend\.env'

$timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$issues = New-Object System.Collections.Generic.List[string]

# ── 1) PM2: souldiary-api phai o trang thai online ──────────────────────────
# Dung file check-pm2-status.js de parse JSON bang Node thay vi ConvertFrom-Json cua PowerShell:
# pm2 jlist chua ca bien moi truong Windows (vd CommonProgramFiles/COMMONPROGRAMFILES) khien
# PowerShell bao loi "duplicated keys" do dictionary noi bo cua no khong phan biet hoa/thuong.
try {
  $checkScript = Join-Path $RepoRoot 'monitoring\check-pm2-status.js'
  $statusOutput = (pm2 jlist | node $checkScript).Trim()
  if ($statusOutput -eq 'NOT_FOUND') {
    $issues.Add('PM2: khong tim thay process souldiary-api')
  } elseif ($statusOutput -like 'PARSE_ERROR:*') {
    $issues.Add("PM2: loi parse JSON - $statusOutput")
  } elseif ($statusOutput -ne 'online') {
    $issues.Add("PM2: souldiary-api dang o trang thai '$statusOutput' (khong phai online)")
  }
} catch {
  $issues.Add("PM2: khong kiem tra duoc - $($_.Exception.Message)")
}

# ── 2) HTTP health: backend local + frontend production qua domain that ────
$endpoints = @(
  @{ Name = 'Backend API (local)';       Url = 'http://localhost:3001/api/features' },
  @{ Name = 'Frontend production (IIS)'; Url = 'https://souldiary.work.gd/' }
)
foreach ($ep in $endpoints) {
  try {
    $resp = Invoke-WebRequest -Uri $ep.Url -UseBasicParsing -TimeoutSec 15
    if ($resp.StatusCode -ne 200) {
      $issues.Add("HTTP: $($ep.Name) tra ve $($resp.StatusCode) (khong phai 200)")
    }
  } catch {
    $issues.Add("HTTP: $($ep.Name) loi - $($_.Exception.Message)")
  }
}

# ── 3) Log loi MOI kem theo lan chay truoc (tranh bao lai loi cu da biet) ──
# Bo qua loi Gemini API 401 da biet san (dang cho cap nhat API key rieng), chi bao loi moi/khac.
$newErrorLines = @()
if (Test-Path $ErrLogPath) {
  $currentLineCount = (Get-Content $ErrLogPath | Measure-Object -Line).Lines
  $isFirstRun = -not (Test-Path $StateFile)
  $lastLineCount = 0
  if (-not $isFirstRun) {
    try {
      $state = Get-Content $StateFile -Raw | ConvertFrom-Json
      $lastLineCount = [int]$state.lastErrorLineCount
    } catch { $isFirstRun = $true }
  }
  if (-not $isFirstRun -and $currentLineCount -gt $lastLineCount) {
    $newErrorLines = Get-Content $ErrLogPath -Tail ($currentLineCount - $lastLineCount) |
      Where-Object { $_ -notmatch 'GoogleGenerativeAI Error' -and $_.Trim() -ne '' }
    if ($newErrorLines.Count -gt 0) {
      $issues.Add("Log: phat hien $($newErrorLines.Count) dong loi moi (xem chi tiet duoi)")
    }
  }
  @{ lastErrorLineCount = $currentLineCount } | ConvertTo-Json | Set-Content $StateFile -Encoding utf8
}

# ── 4) Ghi log (luon ghi, du co van de hay khong) ───────────────────────────
if ($issues.Count -eq 0) {
  $statusLine = "[$timestamp] OK - moi thu binh thuong"
} else {
  $detail = $issues -join "`n  - "
  $statusLine = "[$timestamp] CO VAN DE ($($issues.Count)):`n  - $detail"
  if ($newErrorLines.Count -gt 0) {
    $statusLine += "`n--- Chi tiet dong log loi moi ---`n" + ($newErrorLines -join "`n")
  }
}
Add-Content -Path $LogFile -Value $statusLine -Encoding utf8

# ── 5) Gui email canh bao neu co van de (dung SMTP da cau hinh trong .env) ──
if ($issues.Count -gt 0 -and (Test-Path $EnvFile)) {
  $envVars = @{}
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
      $envVars[$matches[1]] = $matches[2]
    }
  }
  $smtpHost = $envVars['SMTP_HOST']
  $smtpPort = $envVars['SMTP_PORT']
  $smtpUser = $envVars['SMTP_USER']
  $smtpPass = $envVars['SMTP_PASS']
  $alertTo  = $envVars['HEALTH_ALERT_EMAIL']
  if (-not $alertTo) { $alertTo = 'anhtaictv@gmail.com' }

  if ($smtpHost -and $smtpUser -and $smtpPass) {
    try {
      $secPass  = ConvertTo-SecureString $smtpPass -AsPlainText -Force
      $cred     = New-Object System.Management.Automation.PSCredential($smtpUser, $secPass)
      $portNum  = if ($smtpPort) { [int]$smtpPort } else { 587 }
      Send-MailMessage -From $smtpUser -To $alertTo `
        -Subject "[Soul Diary] Canh bao suc khoe he thong - $timestamp" `
        -Body $statusLine -SmtpServer $smtpHost -Port $portNum -UseSsl `
        -Credential $cred -Encoding ([System.Text.Encoding]::UTF8)
      Add-Content -Path $LogFile -Value "[$timestamp] Da gui email canh bao toi $alertTo" -Encoding utf8
    } catch {
      Add-Content -Path $LogFile -Value "[$timestamp] LOI gui email canh bao: $($_.Exception.Message)" -Encoding utf8
    }
  } else {
    Add-Content -Path $LogFile -Value "[$timestamp] Khong gui duoc email - thieu SMTP_HOST/SMTP_USER/SMTP_PASS trong backend\.env" -Encoding utf8
  }
}
