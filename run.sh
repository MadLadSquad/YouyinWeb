#!/usr/bin/env bash
# Builds the site and serves it on http://localhost:8080
exec "$(dirname "$0")/build.sh" --serve "$@"
