#!/bin/bash
rm *.html
rm -rf Traslations/ Components/ UBTCustomFunctions/ UVKBuildTool/ .github/
mv build/* .
rm -rf build
