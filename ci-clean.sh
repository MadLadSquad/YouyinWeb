#!/usr/bin/env bash
rm *.html
rm -rf Translations/ Components/ UBTCustomFunctions/ UVKBuildTool/ .github/
mv build/* .
rm -rf build
