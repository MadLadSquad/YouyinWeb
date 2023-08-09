#!/bin/bash
windows=false
function find_visual_studio_directory()
{
  env | grep "OS=Windows" > /dev/null && windows=true

  if [ "${windows}" = true ]; then
    wd=$(pwd)
    cd "C:/Program Files (x86)/Microsoft Visual Studio/Installer/" || exit
    find "vswhere.exe" -maxdepth 0 &> /dev/null || (cd "${wd}" && download_vswhere)

    VSShortVer=$(./vswhere.exe | grep "catalog_productLine: Dev17")
    VSShortVer="${VSShortVer:24}"

    VSVer=$(./vswhere.exe | grep "catalog_productLineVersion:")
    VSVer="${VSVer:28}"

    cd "${wd}" || exit
  fi
  return
}

cpus=$(grep -c processor /proc/cpuinfo)

find_visual_studio_directory

cp "../UBTCustomFunctions" src/Web/ -r || exit

mkdir build
cd build || exit
if windows; then
  cmake .. -G "Visual Studio ${VSShortVer} ${VSVer}" -DUBT_COMPILING_FOR_WEB=ON -DCMAKE_BUILD_TYPE=RELEASE
  MSBuild.exe UVKBuildTool.sln -property:Configuration=Release -property:Platform=x64 -property:maxCpuCount="${cpus}" || exit
else
  cmake .. -G "Unix Makefiles" -DUBT_COMPILING_FOR_WEB=ON -DCMAKE_BUILD_TYPE=RELEASE || exit
  make -j "${cpus}" || exit
fi

cp Release/UVKBuildTool.exe . 2> /dev/null || echo -n " " || exit
cp Release/UVKBuildToolLib.dll . 2> /dev/null || cp Release/libUVKBuildToolLib.dll . 2> /dev/null || echo -n " "
cp Release/UVKBuildToolLib.lib . 2> /dev/null || cp Release/libUVKBuildToolLib.lib . 2> /dev/null || echo -n " "
cp yaml-cpp/Release/yaml-cpp.dll . 2> /dev/null || cp yaml-cpp/Release/libyaml-cpp.dll . 2> /dev/null || echo -n " "

cd ../../ || exit
echo -e "\x1b[32mUVKBuildTool set up successfully\x1b[0m"
