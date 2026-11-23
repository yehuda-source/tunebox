"""Add TuneBox's native code and embedded Python to the Capacitor iOS project (ios/App).

Run after `npx cap add ios` (it's idempotent): pip install pbxproj && python3 scripts/ios-configure-project.py
The result is committed, so this only needs re-running if the Xcode project is regenerated.

What it sets up (the steps from https://docs.python.org/3/using/ios.html, "Adding Python to an iOS project"):
- the Swift plugins and the C bridge in App/Native, with a bridging header
- Python.xcframework (downloaded by scripts/ios-prepare.sh), embedded and signed
- python-app/ (tunebox_bridge.py, bundled yt-dlp, mutagen, certifi) copied into the app
- a build step that installs Python's standard library and turns its binary modules into frameworks
"""
from pathlib import Path

from pbxproj import XcodeProject
from pbxproj.pbxextensions import FileOptions

ROOT = Path(__file__).resolve().parent.parent / 'ios' / 'App'
PROJECT = ROOT / 'App.xcodeproj' / 'project.pbxproj'
TARGET = 'App'
SCRIPT_NAME = 'Process Python libraries'
SCRIPT = '''set -e
# Unsigned builds (for re-signing with Signulous) have no identity; sign the modules ad hoc.
export EXPANDED_CODE_SIGN_IDENTITY="${EXPANDED_CODE_SIGN_IDENTITY:--}"
source "$PROJECT_DIR/Python.xcframework/build/utils.sh"
install_python Python.xcframework
'''

project = XcodeProject.load(str(PROJECT))
app_group = project.get_or_create_group('App')
native_group = project.get_or_create_group('Native', parent=app_group)

def has(name):
    return bool(project.get_files_by_name(name))

for f in sorted((ROOT / 'App' / 'Native').iterdir()):
    if has(f.name):
        continue
    # force=True skips pbxproj's duplicate check, which fails on Capacitor's Swift package entries
    # (`has` already prevents duplicates). Headers are listed but not built.
    project.add_file(str(f.relative_to(ROOT)), parent=native_group, target_name=TARGET, force=True,
                     file_options=FileOptions(create_build_files=f.suffix != '.h'))

if not has('python-app'):
    project.add_file('python-app', parent=app_group, target_name=TARGET, force=True)
# A folder reference: the whole folder is copied into the app as python-app/.
for ref in project.get_files_by_name('python-app'):
    ref['lastKnownFileType'] = 'folder'

if not has('Python.xcframework'):
    project.add_file('Python.xcframework', parent=project.get_or_create_group('Frameworks'), target_name=TARGET,
                     force=True, file_options=FileOptions(embed_framework=True, code_sign_on_copy=True))

target = project.get_target_by_name(TARGET)
existing = [project.objects[p] for p in target.buildPhases]
if not any(getattr(p, 'name', None) == SCRIPT_NAME for p in existing):
    project.add_run_script(SCRIPT, target_name=TARGET, insert_before_compile=False)
    script_phase = [p for p in (project.objects[i] for i in target.buildPhases) if getattr(p, 'isa', '') == 'PBXShellScriptBuildPhase'][-1]
    script_phase['name'] = SCRIPT_NAME
    script_phase['alwaysOutOfDate'] = '1'

# The Python step must run after resources are copied but before frameworks are embedded and signed.
phases = list(target.buildPhases)
def phase_index(pred):
    for i, pid in enumerate(phases):
        if pred(project.objects[pid]):
            return i
    return None

script_i = phase_index(lambda p: getattr(p, 'name', None) == SCRIPT_NAME)
embed_i = phase_index(lambda p: p.isa == 'PBXCopyFilesBuildPhase')
if embed_i is not None and script_i > embed_i:
    pid = phases.pop(script_i)
    phases.insert(embed_i, pid)
    target.buildPhases = phases

# pbxproj adds this (already present as two separate entries) when embedding a framework.
project.remove_flags('LD_RUNPATH_SEARCH_PATHS', '$(inherited) @executable_path/Frameworks', target_name=TARGET)
project.set_flags('SWIFT_OBJC_BRIDGING_HEADER', 'App/Native/App-Bridging-Header.h', target_name=TARGET)
project.set_flags('ENABLE_USER_SCRIPT_SANDBOXING', 'NO', target_name=TARGET)
project.add_flags('FRAMEWORK_SEARCH_PATHS', '$(PROJECT_DIR)', target_name=TARGET)
project.set_flags('CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER', 'NO', target_name=TARGET)

project.save()
print('Configured', PROJECT)
