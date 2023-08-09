#!/bin/bash
rm *.hmtl
rm -rf components/ UBTCustomFunctions/ UVKBuildTool/ .github/
mv build/*.html .
rm -rf build
