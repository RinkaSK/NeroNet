param(
 [Parameter(Mandatory=$true)][string]$NodePath,
 [Parameter(Mandatory=$true)][string]$Destination,
 [Parameter(Mandatory=$true)][string]$DeploymentProfile
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$dest=[IO.Path]::GetFullPath($Destination).TrimEnd('\')
$DeploymentProfile=(Resolve-Path -LiteralPath $DeploymentProfile).Path
& $NodePath (Join-Path $root 'app\index.mjs') profile --profile $DeploymentProfile --package $dest | Out-Null
if($LASTEXITCODE){throw 'Installation destination rejected by deployment profile'}
if(Test-Path -LiteralPath $dest){throw 'Destination already exists; choose a new directory. Existing applications and homes are never overwritten'}
if($dest.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Destination cannot be inside the source package'}
& (Join-Path $PSScriptRoot 'Test-NeroNet.ps1') -NodePath $NodePath
# SHA256SUMS.txt lists every file of the package: "<sha256> *<relative path>".
$entries=@(Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.txt') -Encoding UTF8 | Where-Object {$_} | ForEach-Object {if($_ -notmatch '^[a-f0-9]{64} \*(.+)$'){throw 'Invalid SHA256SUMS.txt'};$Matches[1]})
New-Item -ItemType Directory -Path $dest | Out-Null
$marker=Join-Path $dest '.install-incomplete'
Set-Content -LiteralPath $marker -Value 'Installation has not completed; do not start this directory' -Encoding UTF8
foreach($entry in $entries){
 $target=[IO.Path]::GetFullPath((Join-Path $dest $entry))
 if(-not $target.StartsWith($dest+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe package path'}
 New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
 Copy-Item -LiteralPath (Join-Path $root $entry) -Destination $target
}
Copy-Item -LiteralPath (Join-Path $root 'SHA256SUMS.txt') -Destination (Join-Path $dest 'SHA256SUMS.txt')
# Check exact copied bytes, not merely copy-command exit status.
& (Join-Path $dest 'scripts\Test-NeroNet.ps1') -NodePath $NodePath
Remove-Item -LiteralPath $marker
[pscustomobject]@{installed=$dest;started=$false;homeCreated=$false;nativeDirectory=(Join-Path $dest 'native');next='Log in to the bot QQ, then run scripts\Start-NeroNet.ps1 with -DeploymentProfile and a -HomeDirectory outside the installation'}
