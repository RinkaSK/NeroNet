# Check the package files against SHA256SUMS.txt and the Native components against their manifest.
param(
 [string]$NodePath,
 [string]$NativeDirectory
)
$ErrorActionPreference='Stop'
if([Environment]::OSVersion.Version.Major -lt 10){throw '需要 Windows 10 或 Windows 11（64 位）。这台电脑的系统版本过旧，NeroNet 使用的 Node.js 24 无法在上面运行'}
$root=Split-Path -Parent $PSScriptRoot
if(!$NodePath){$local=Join-Path $root 'node.exe';$NodePath=if(Test-Path -LiteralPath $local -PathType Leaf){$local}else{'node.exe'}}
$command=Get-Command $NodePath -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$command){throw '找不到 Node.js。请安装 Node.js 24（x64），或把 node.exe 放进 NeroNet 文件夹，或用 -NodePath 指定它的位置'}
$NodePath=$command.Path
$versionText=& $NodePath -p 'JSON.stringify({version:process.versions.node,arch:process.arch,platform:process.platform})'
if($LASTEXITCODE){throw '无法运行 Node.js：'+$NodePath}
$version=$versionText|ConvertFrom-Json
$major=[int]($version.version -replace '\..*$','')
if($version.arch -ne 'x64' -or $version.platform -ne 'win32' -or $major -lt 24){throw ('需要 Windows x64 的 Node.js 24 或更新版本（本版本用 24.22.1 构建和测试），找到的是 '+$version.version+' '+$version.arch)}
if($major -ne 24){Write-Host ('提示：Node.js '+$version.version+' 不是测试过的 24.x 版本，NeroNet 照常启动；遇到问题时请换回 Node.js 24。') -ForegroundColor Yellow}
$argsList=@((Join-Path $root 'app\index.mjs'),'check',$root)
if($NativeDirectory){$argsList += [IO.Path]::GetFullPath($NativeDirectory)}
& $NodePath @argsList
if($LASTEXITCODE){throw '文件校验没有通过：包内文件或 Native 组件与清单不一致。没有启动任何程序，请重新下载或解压'}
