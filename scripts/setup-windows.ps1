# Libera o StreamHub rodando no WSL para o celular e outros aparelhos da rede. Execute uma vez, como administrador:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
# O WSL passa a usar a rede espelhada (as portas dos contêineres ficam no IP do Windows) e o firewall libera as portas
# do StreamHub apenas em redes privadas. O WSL é reiniciado no final.
#Requires -RunAsAdministrator
param(
    [int[]]$TcpPorts = @(5173, 8096, 6881),
    [int[]]$UdpPorts = @(6881),
    [string]$Distro
)
$ErrorActionPreference = 'Stop'

# 1) rede espelhada no .wslconfig (sem apagar o que já existir)
$cfg = Join-Path $env:USERPROFILE '.wslconfig'
$lines = [System.Collections.Generic.List[string]]::new()
if (Test-Path $cfg) { $lines.AddRange([string[]](Get-Content $cfg)) }
$i = $lines.FindIndex({ param($l) $l -match '^\s*networkingMode\s*=' })
if ($i -ge 0) {
    $lines[$i] = 'networkingMode=mirrored'
} else {
    $s = $lines.FindIndex({ param($l) $l -match '^\s*\[wsl2\]\s*$' })
    if ($s -ge 0) { $lines.Insert($s + 1, 'networkingMode=mirrored') } else { $lines.Add('[wsl2]'); $lines.Add('networkingMode=mirrored') }
}
[IO.File]::WriteAllLines($cfg, $lines, [Text.UTF8Encoding]::new($false))   # sem BOM: o WSL não lê o arquivo com BOM
Write-Host "rede espelhada configurada em $cfg"

# 2) firewall: Hyper-V (entrada no WSL) e Windows, somente redes privadas
$wslVm = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
foreach ($r in @(@{ Proto = 'TCP'; Ports = $TcpPorts }, @{ Proto = 'UDP'; Ports = $UdpPorts })) {
    if (-not $r.Ports) { continue }
    $name = "StreamHub-$($r.Proto)"
    $ports = [string[]]$r.Ports
    Get-NetFirewallHyperVRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallHyperVRule
    New-NetFirewallHyperVRule -Name $name -DisplayName "StreamHub ($($r.Proto))" -Direction Inbound -VMCreatorId $wslVm `
        -Protocol $r.Proto -LocalPorts $ports -Action Allow -Profiles Private | Out-Null
    Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name $name -DisplayName "StreamHub ($($r.Proto))" -Direction Inbound `
        -Protocol $r.Proto -LocalPort $ports -Action Allow -Profile Private | Out-Null
    Write-Host "firewall: $($r.Proto) $($ports -join ', ') liberadas em redes privadas"
}
$public = Get-NetConnectionProfile | Where-Object NetworkCategory -eq 'Public'
if ($public) { Write-Warning "Rede marcada como Pública ($($public.InterfaceAlias -join ', ')): marque como Privada nas configurações de rede do Windows para o celular conseguir acessar." }

# 3) reinicia o WSL para aplicar a rede e sobe a distro de novo (o Docker inicia sozinho pelo systemd)
$env:WSL_UTF8 = '1'
if (-not $Distro) { $Distro = (wsl.exe -l -q) | Where-Object { $_ -and $_ -notmatch '^docker-desktop' } | Select-Object -First 1 }
wsl.exe --shutdown
if ($Distro) { wsl.exe -d $Distro -e true; Write-Host "WSL reiniciado ($Distro)" }

$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback' } | Select-Object -First 1 -ExpandProperty IPAddress
if ($ip) { Write-Host "`nNo celular (mesma rede): http://${ip}:5173" }
