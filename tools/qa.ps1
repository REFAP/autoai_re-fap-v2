param([string]$Base="http://localhost:3000")

function Call-Api([string]$Method,[string]$Url,[string]$Body,[string]$CT="application/json"){
  try{
    $r = Invoke-WebRequest -Method $Method -Uri $Url -Body $Body -ContentType $CT -UseBasicParsing -ErrorAction Stop
    return [pscustomobject]@{ Status=$r.StatusCode; Body=$r.Content }
  }catch{
    $resp=$_.Exception.Response
    if($resp){
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      return [pscustomobject]@{ Status=[int]$resp.StatusCode; Body=$sr.ReadToEnd() }
    }
    throw
  }
}

$fail = @()

# 1) générique -> TRIAGE
$r1 = Call-Api POST "$Base/api/chat" (@{ message="fap" } | ConvertTo-Json -Depth 5)
if (-not ($r1.Status -eq 200 -and $r1.Body -match '"stage"\s*:\s*"triage"')) {
  $fail += "Triage"; 
}

# 2) 2 signaux -> DIAG FAP (JSON)
$r2 = Call-Api POST "$Base/api/chat" (@{ messages=@(@{ role="user"; content="fumée noire et perte de puissance" }) } | ConvertTo-Json -Depth 5)
if (-not ($r2.Status -eq 200 -and $r2.Body -match '"stage"\s*:\s*"diagnosis"' -and $r2.Body -match '"suspected"\s*:\s*\[\s*"FAP"\s*\]')) {
  $fail += "Diag-JSON";
}

# 3) 2 signaux -> DIAG FAP (texte brut, accents cassés tolérés)
$r3 = Call-Api POST "$Base/api/chat" "fumée noire et perte de puissance" "text/plain"
if (-not ($r3.Status -eq 200 -and $r3.Body -match '"stage"\s*:\s*"diagnosis"' -and $r3.Body -match '"suspected"\s*:\s*\[\s*"FAP"\s*\]')) {
  $fail += "Diag-Text";
}

if ($fail.Count -gt 0) {
  Write-Host ("QA FAIL ❌ -> " + ($fail -join ", ")) -ForegroundColor Red
  Write-Host "---- R1 ----`n$($r1.Body)`n---- R2 ----`n$($r2.Body)`n---- R3 ----`n$($r3.Body)"
  exit 1
} else {
  Write-Host "QA OK ✅" -ForegroundColor Green
  exit 0
}
