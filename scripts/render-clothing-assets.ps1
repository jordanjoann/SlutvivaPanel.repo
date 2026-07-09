param(
  [string]$InputRoot = ".\games\gta\los-santos\server-data\resources\[mods]\slutvival-clothing\stream",
  [string]$OutputRoot = ".\games\gta\los-santos\server-data\resources\[mods]\slutvival-clothing-audit\data\asset-renders",
  [string]$PythonBin = "",
  [string]$BlenderBin = "",
  [string]$SollumzPath = "",
  [int]$Limit = 0,
  [int]$Size = 768,
  [int]$Supersample = 2,
  [double]$Yaw = -18,
  [double]$Pitch = 4,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$ScriptPath = Join-Path $PSScriptRoot "render-clothing-assets.py"
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Renderer script not found: $ScriptPath"
}

$RendererArgs = @(
  "--input-root", $InputRoot,
  "--output-root", $OutputRoot,
  "--size", "$Size",
  "--supersample", "$Supersample",
  "--yaw", "$Yaw",
  "--pitch", "$Pitch"
)

if ($Limit -gt 0) {
  $RendererArgs += @("--limit", "$Limit")
}

if ($Force) {
  $RendererArgs += "--force"
}

if ($SollumzPath) {
  $RendererArgs += @("--sollumz-path", $SollumzPath)
}

if ($PythonBin) {
  & $PythonBin $ScriptPath @RendererArgs
  exit $LASTEXITCODE
}

$PythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($PythonCommand) {
  & $PythonCommand.Source $ScriptPath @RendererArgs
  exit $LASTEXITCODE
}

$PyCommand = Get-Command py -ErrorAction SilentlyContinue
if ($PyCommand) {
  & $PyCommand.Source -3 $ScriptPath @RendererArgs
  exit $LASTEXITCODE
}

if ($BlenderBin) {
  if (-not (Test-Path -LiteralPath $BlenderBin)) {
    throw "Blender executable not found: $BlenderBin"
  }

  & $BlenderBin --background --python $ScriptPath -- @RendererArgs
  exit $LASTEXITCODE
}

throw "No Python runtime found. Pass -PythonBin or -BlenderBin."
