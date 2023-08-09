#!/bin/bash
rm *.hmtl
rm -rf Components/ UBTCustomFunctions/ UVKBuildTool/ .github/
mv build/*.html .
rm -rf build
