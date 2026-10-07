<#
.SYNOPSIS
  Build a dlib wheel linked against OpenBLAS, with the DLL inside it.

.DESCRIPTION
  dlib-bin, the default in requirements.txt, is built without BLAS. The face
  recogniser is a ResNet, and without BLAS dlib multiplies its matrices with
  its own loops. Measured on the machine this was written on, same photograph:

      descriptor, dlib-bin          ~400 ms
      descriptor, this wheel         ~29 ms
      12-frame burst, dlib-bin      ~600 ms
      12-frame burst, this wheel    ~210 ms

  The descriptors agree to 1e-6, so enrolments made on either build match on
  the other. Detection (HOG) does not use BLAS and is unchanged.

  The cost is the build, not the result: this needs Visual Studio Build Tools
  (C++ workload) and takes about fifteen minutes. It is done once per Python
  and dlib version; the wheel it writes installs anywhere with the same Python
  and needs nothing else on the machine. libopenblas.dll is bundled into it by
  delvewheel -- without that, `import dlib` fails and the service refuses to
  start.

  Everything happens under a short working directory, because cmake's own
  files and dlib's build tree overflow Windows' 260-character path limit from
  anywhere deep.

.PARAMETER Install
  Also swap it into face/.venv: uninstall dlib-bin, install the wheel, and
  print what dlib reports about itself.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build_dlib_blas.ps1 -Install
#>
param(
    [string]$DlibVersion = "20.0.1",
    [string]$OpenBlasVersion = "0.3.28",
    [string]$WorkDir = (Join-Path $env:LOCALAPPDATA "Temp\dlb"),
    [switch]$Install
)

$ErrorActionPreference = "Stop"

$FaceDir = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $FaceDir ".venv"
$OutDir = Join-Path $FaceDir "wheels"

function Step($message) { Write-Host "`n== $message" -ForegroundColor Cyan }

function Run {
    # Native commands do not stop the script on failure by themselves.
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe exited with $LASTEXITCODE" }
}

if (-not (Test-Path (Join-Path $Venv "pyvenv.cfg"))) {
    throw "No virtualenv at $Venv. Create it first (see README), so the wheel matches its Python."
}

# The same interpreter the service runs on, so the wheel's ABI tag matches.
$PythonHome = ((Get-Content (Join-Path $Venv "pyvenv.cfg") | Select-String '^home').ToString().Split('=')[1]).Trim()
$BasePython = Join-Path $PythonHome "python.exe"

New-Item -ItemType Directory -Force $WorkDir, $OutDir | Out-Null
$BuildVenv = Join-Path $WorkDir "venv"
$BuildPython = Join-Path $BuildVenv "Scripts\python.exe"

Step "Build environment in $WorkDir"
if (-not (Test-Path $BuildPython)) { Run $BasePython @("-m", "venv", $BuildVenv) }
Run $BuildPython @("-m", "pip", "install", "-q", "cmake", "setuptools", "wheel", "delvewheel")

Step "OpenBLAS $OpenBlasVersion"
$OpenBlas = Join-Path $WorkDir "openblas"
if (-not (Test-Path (Join-Path $OpenBlas "bin\libopenblas.dll"))) {
    $zip = Join-Path $WorkDir "openblas.zip"
    # curl.exe rather than Invoke-WebRequest, which on PowerShell 5.1 takes
    # minutes over a download curl finishes in seconds.
    Run "curl.exe" @("-sSfL", "-o", $zip,
        "https://github.com/OpenMathLib/OpenBLAS/releases/download/v$OpenBlasVersion/OpenBLAS-$OpenBlasVersion-x64.zip")
    Expand-Archive $zip $OpenBlas -Force
}
# CMake's FindBLAS looks for openblas.lib under lib\; the release ships
# libopenblas.lib at its root.
New-Item -ItemType Directory -Force (Join-Path $OpenBlas "lib") | Out-Null
Copy-Item (Join-Path $OpenBlas "libopenblas.lib") (Join-Path $OpenBlas "lib\openblas.lib") -Force

Step "dlib $DlibVersion source"
$Source = Join-Path $WorkDir "dlib-$DlibVersion"
if (-not (Test-Path (Join-Path $Source "setup.py"))) {
    $tarball = Join-Path $WorkDir "dlib-$DlibVersion.tar.gz"
    Run $BuildPython @("-c", @"
import json, urllib.request as u
meta = json.load(u.urlopen('https://pypi.org/pypi/dlib/$DlibVersion/json'))
sdist = next(f for f in meta['urls'] if f['packagetype'] == 'sdist')
u.urlretrieve(sdist['url'], r'$tarball')
"@)
    Run "tar" @("-xzf", $tarball, "-C", $WorkDir)
}

Step "Building (about fifteen minutes)"
# dlib's setup.py only reads --set after setuptools has already rejected it,
# so the switches go in through the environment: it forwards DLIB_* to cmake,
# and cmake reads the rest itself.
$env:DLIB_USE_BLAS = "ON"
$env:DLIB_USE_LAPACK = "ON"
$env:BLA_VENDOR = "OpenBLAS"
$env:CMAKE_PREFIX_PATH = $OpenBlas.Replace('\', '/')
$env:CMAKE_LIBRARY_PATH = (Join-Path $OpenBlas "lib").Replace('\', '/')
$env:PATH = "$(Join-Path $BuildVenv 'Scripts');$(Join-Path $OpenBlas 'bin');$env:PATH"

$Dist = Join-Path $Source "dist"
Remove-Item -Recurse -Force $Dist -ErrorAction SilentlyContinue
Push-Location $Source
try {
    Run $BuildPython @("setup.py", "bdist_wheel")
} finally {
    Pop-Location
}
$Built = Get-ChildItem (Join-Path $Dist "dlib-*.whl") | Select-Object -First 1

Step "Bundling libopenblas.dll into the wheel"
Run $BuildPython @("-m", "delvewheel", "repair", "--add-path", (Join-Path $OpenBlas "bin"), "-w", $OutDir, $Built.FullName)
$Wheel = Get-ChildItem (Join-Path $OutDir $Built.Name)
Write-Host "Wrote $($Wheel.FullName)"

Step "Checking it links BLAS"
# In the build venv, where nothing else could be supplying the DLL.
Run $BuildPython @("-m", "pip", "install", "-q", "--force-reinstall", "--no-deps", $Wheel.FullName)
Push-Location $WorkDir
try {
    Run $BuildPython @("-c", "import dlib, sys; print('dlib', dlib.__version__, 'BLAS', dlib.DLIB_USE_BLAS); sys.exit(0 if dlib.DLIB_USE_BLAS else 1)")
} finally {
    Pop-Location
}

if ($Install) {
    Step "Installing into $Venv"
    $VenvPython = Join-Path $Venv "Scripts\python.exe"
    # Both distributions provide the `dlib` module; leaving dlib-bin installed
    # would have the two overwrite each other's files.
    Run $VenvPython @("-m", "pip", "uninstall", "-y", "dlib-bin")
    Run $VenvPython @("-m", "pip", "install", "--no-deps", $Wheel.FullName)
    Run $VenvPython @("-c", "import dlib; print('face/.venv: dlib', dlib.__version__, 'BLAS', dlib.DLIB_USE_BLAS)")
    Write-Host "Restart the face service to pick it up. /health reports blas: true."
} else {
    Write-Host "`nTo use it: pip uninstall -y dlib-bin; pip install --no-deps `"$($Wheel.FullName)`""
}
