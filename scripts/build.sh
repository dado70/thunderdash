#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Alessandro (dado) Scapuzzi <dado70@gmail.com>
#
# Packages the extension into dist/thunderdash-<version>.xpi.
# Only runtime files are included (no tests, scripts or internal docs).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/thunderdash-${version}.xpi"

mkdir -p dist
rm -f "$out"
zip -r -X -q "$out" \
  manifest.json background.mjs LICENSE README.md \
  src dashboard options _locales icons \
  -x '*/.*' '.*'

echo "Built $out"
unzip -l "$out"
