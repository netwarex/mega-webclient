#!/bin/bash
set -e

echo "Building WASM crypto module..."

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack not found. Install it with:"
    echo "  cargo install wasm-pack"
    exit 1
fi

# Build for web target
wasm-pack build --target web --out-dir ../js/wasm --release

echo "WASM module built successfully to js/wasm/"
echo ""
echo "Files generated:"
ls -lh ../js/wasm/

echo ""
echo "To use the WASM backend, select it from the Settings UI dropdown."
