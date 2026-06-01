$ports = 5001,5002,5003,5004,5005
foreach ($p in $ports) {
  $matches = netstat -aon | Select-String ":$p"
  foreach ($m in $matches) {
    $cols = ($m -split '\s+')
    $procId = $cols[-1]
    if ($procId) {
      Write-Host "Found PID $procId on port $p"
      try {
        taskkill /PID $procId /F | Out-Null
        Write-Host "Killed PID $procId"
      } catch {
        Write-Host "Failed to kill PID $procId"
      }
    }
  }
}
Write-Host "----- Ports after cleanup -----"
netstat -aon | Select-String ':5001|:5002|:5003|:5004|:5005' | ForEach-Object { Write-Host $_ }
