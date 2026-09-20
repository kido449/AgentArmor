 = 'https://agentarmor-production.up.railway.app/api/python-logs'
for (=0;  -lt 30; ++) {
    try {
         = Invoke-WebRequest -Uri  -UseBasicParsing
         = .Headers['Content-Type']
        if ( -match 'application/json') {
            Write-Host "DEPLOYMENT FINISHED!"
            Write-Host .Content
            exit 0
        }
    } catch {}
    Start-Sleep -Seconds 10
}
Write-Host "Timeout waiting for deploy"
