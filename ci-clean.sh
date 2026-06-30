#!/usr/bin/env bash
rm -rf *.html scripts/ styles/ sw.js manifest.json robots.txt sitemap.xml favicon*.png icon-*.png
rm -rf Translations/ Components/ UBTCustomFunctions/ UVKBuildTool/ .github/
mv build/* .
rm -rf build
