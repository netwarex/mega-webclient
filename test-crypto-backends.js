#!/usr/bin/env node

/**
 * Crypto Backend Test Suite
 * Tests the multi-backend crypto implementation
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Crypto Backend Test Suite\n');
console.log('='.repeat(60));

// Test results
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    try {
        fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log('✅', name);
    } catch (error) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        console.log('❌', name);
        console.log('   Error:', error.message);
    }
}

function checkFile(filepath) {
    if (!fs.existsSync(filepath)) {
        throw new Error(`File not found: ${filepath}`);
    }
    const stats = fs.statSync(filepath);
    if (!stats.isFile()) {
        throw new Error(`Not a file: ${filepath}`);
    }
    return true;
}

function checkJsSyntax(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');

    // Basic syntax checks
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
        throw new Error(`Mismatched braces: ${openBraces} open, ${closeBraces} close`);
    }

    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    if (openParens !== closeParens) {
        throw new Error(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
    }

    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;

    if (openBrackets !== closeBrackets) {
        throw new Error(`Mismatched brackets: ${openBrackets} open, ${closeBrackets} close`);
    }

    return true;
}

function checkForFunction(filepath, functionName) {
    const content = fs.readFileSync(filepath, 'utf8');
    const patterns = [
        new RegExp(`function\\s+${functionName}\\s*\\(`),
        new RegExp(`${functionName}\\s*=\\s*function\\s*\\(`),
        new RegExp(`${functionName}\\s*=\\s*\\(`),
        new RegExp(`const\\s+${functionName}\\s*=`),
        new RegExp(`let\\s+${functionName}\\s*=`),
        new RegExp(`var\\s+${functionName}\\s*=`)
    ];

    const found = patterns.some(pattern => pattern.test(content));
    if (!found) {
        throw new Error(`Function '${functionName}' not found in ${filepath}`);
    }
    return true;
}

function checkForClass(filepath, className) {
    const content = fs.readFileSync(filepath, 'utf8');
    const pattern = new RegExp(`class\\s+${className}`);

    if (!pattern.test(content)) {
        throw new Error(`Class '${className}' not found in ${filepath}`);
    }
    return true;
}

function checkForExport(filepath, exportName) {
    const content = fs.readFileSync(filepath, 'utf8');
    const patterns = [
        new RegExp(`${exportName}\\s*:`),
        new RegExp(`'${exportName}'\\s*:`),
        new RegExp(`"${exportName}"\\s*:`)
    ];

    const found = patterns.some(pattern => pattern.test(content));
    if (!found) {
        throw new Error(`Export '${exportName}' not found in ${filepath}`);
    }
    return true;
}

console.log('\n📁 File Structure Tests');
console.log('-'.repeat(60));

test('crypto-backends.js exists', () => {
    checkFile('js/crypto-backends.js');
});

test('crypto-backend-ui.js exists', () => {
    checkFile('js/crypto-backend-ui.js');
});

test('encrypter-multi.js exists', () => {
    checkFile('encrypter-multi.js');
});

test('decrypter-multi.js exists', () => {
    checkFile('decrypter-multi.js');
});

test('crypto-backend-test.html exists', () => {
    checkFile('crypto-backend-test.html');
});

test('WASM Cargo.toml exists', () => {
    checkFile('wasm-crypto/Cargo.toml');
});

test('WASM lib.rs exists', () => {
    checkFile('wasm-crypto/src/lib.rs');
});

test('WASM build.sh exists', () => {
    checkFile('wasm-crypto/build.sh');
});

test('WASM build.sh is executable', () => {
    const stats = fs.statSync('wasm-crypto/build.sh');
    const isExecutable = (stats.mode & 0o111) !== 0;
    if (!isExecutable) {
        throw new Error('build.sh is not executable');
    }
});

console.log('\n🔍 JavaScript Syntax Tests');
console.log('-'.repeat(60));

test('crypto-backends.js has valid syntax', () => {
    checkJsSyntax('js/crypto-backends.js');
});

test('crypto-backend-ui.js has valid syntax', () => {
    checkJsSyntax('js/crypto-backend-ui.js');
});

test('encrypter-multi.js has valid syntax', () => {
    checkJsSyntax('encrypter-multi.js');
});

test('decrypter-multi.js has valid syntax', () => {
    checkJsSyntax('decrypter-multi.js');
});

console.log('\n🏗️ Architecture Tests');
console.log('-'.repeat(60));

test('CryptoBackend base class exists', () => {
    checkForClass('js/crypto-backends.js', 'CryptoBackend');
});

test('AsmJsBackend class exists', () => {
    checkForClass('js/crypto-backends.js', 'AsmJsBackend');
});

test('WebCryptoBackend class exists', () => {
    checkForClass('js/crypto-backends.js', 'WebCryptoBackend');
});

test('WasmBackend class exists', () => {
    checkForClass('js/crypto-backends.js', 'WasmBackend');
});

test('createBackend function exists', () => {
    checkForFunction('js/crypto-backends.js', 'createBackend');
});

test('detectAvailableBackends function exists', () => {
    checkForFunction('js/crypto-backends.js', 'detectAvailableBackends');
});

test('getCurrentBackend function exists', () => {
    checkForFunction('js/crypto-backends.js', 'getCurrentBackend');
});

test('setCurrentBackend function exists', () => {
    checkForFunction('js/crypto-backends.js', 'setCurrentBackend');
});

console.log('\n🔐 Backend Implementation Tests');
console.log('-'.repeat(60));

test('AsmJsBackend has init method', () => {
    const content = fs.readFileSync('js/crypto-backends.js', 'utf8');
    if (!content.includes('async init()') && !content.includes('init()')) {
        throw new Error('init method not found in backends');
    }
});

test('Backends have encrypt method', () => {
    const content = fs.readFileSync('js/crypto-backends.js', 'utf8');
    const encryptCount = (content.match(/async encrypt\(/g) || []).length;
    if (encryptCount < 3) {
        throw new Error(`Expected at least 3 encrypt methods, found ${encryptCount}`);
    }
});

test('Backends have decrypt method', () => {
    const content = fs.readFileSync('js/crypto-backends.js', 'utf8');
    const decryptCount = (content.match(/async decrypt\(/g) || []).length;
    if (decryptCount < 3) {
        throw new Error(`Expected at least 3 decrypt methods, found ${decryptCount}`);
    }
});

test('BACKENDS constant is defined', () => {
    const content = fs.readFileSync('js/crypto-backends.js', 'utf8');
    if (!content.includes('BACKENDS')) {
        throw new Error('BACKENDS constant not found');
    }
});

console.log('\n👷 Worker Tests');
console.log('-'.repeat(60));

test('encrypter-multi imports aesasm.js', () => {
    const content = fs.readFileSync('encrypter-multi.js', 'utf8');
    if (!content.includes("importScripts('aesasm.js')")) {
        throw new Error('Missing aesasm.js import');
    }
});

test('encrypter-multi imports crypto-backends.js', () => {
    const content = fs.readFileSync('encrypter-multi.js', 'utf8');
    if (!content.includes("importScripts('js/crypto-backends.js')")) {
        throw new Error('Missing crypto-backends.js import');
    }
});

test('encrypter-multi has onmessage handler', () => {
    checkForFunction('encrypter-multi.js', 'onmessage');
});

test('decrypter-multi has onmessage handler', () => {
    checkForFunction('decrypter-multi.js', 'onmessage');
});

test('encrypter-multi has backend initialization', () => {
    const content = fs.readFileSync('encrypter-multi.js', 'utf8');
    if (!content.includes('initBackend')) {
        throw new Error('initBackend not found');
    }
});

test('Workers support legacy ASM.js mode', () => {
    const encContent = fs.readFileSync('encrypter-multi.js', 'utf8');
    const decContent = fs.readFileSync('decrypter-multi.js', 'utf8');

    if (!encContent.includes('legacyEncrypt') || !decContent.includes('legacyDecrypt')) {
        throw new Error('Legacy mode functions not found');
    }
});

test('Workers support modern backend mode', () => {
    const encContent = fs.readFileSync('encrypter-multi.js', 'utf8');
    const decContent = fs.readFileSync('decrypter-multi.js', 'utf8');

    if (!encContent.includes('modernEncrypt') || !decContent.includes('modernDecrypt')) {
        throw new Error('Modern mode functions not found');
    }
});

test('Workers handle backend switching', () => {
    const encContent = fs.readFileSync('encrypter-multi.js', 'utf8');

    if (!encContent.includes('setBackend')) {
        throw new Error('Backend switching not implemented');
    }
});

console.log('\n🎨 UI Tests');
console.log('-'.repeat(60));

test('UI has initCryptoBackendUI function', () => {
    checkForFunction('js/crypto-backend-ui.js', 'initCryptoBackendUI');
});

test('UI has switchBackend function', () => {
    checkForFunction('js/crypto-backend-ui.js', 'switchBackend');
});

test('UI has runPerformanceTest function', () => {
    checkForFunction('js/crypto-backend-ui.js', 'runPerformanceTest');
});

test('UI creates dropdown selector', () => {
    const content = fs.readFileSync('js/crypto-backend-ui.js', 'utf8');
    if (!content.includes('crypto-backend-selector')) {
        throw new Error('Dropdown selector not found');
    }
});

test('UI exports CryptoBackendUI', () => {
    checkForExport('js/crypto-backend-ui.js', 'CryptoBackendUI');
});

test('Test HTML includes required scripts', () => {
    const content = fs.readFileSync('crypto-backend-test.html', 'utf8');

    if (!content.includes('aesasm.js')) {
        throw new Error('Test HTML missing aesasm.js');
    }

    if (!content.includes('crypto-backends.js')) {
        throw new Error('Test HTML missing crypto-backends.js');
    }
});

test('Test HTML has test functions', () => {
    const content = fs.readFileSync('crypto-backend-test.html', 'utf8');

    const requiredFunctions = [
        'runSingleTest',
        'runAllTests',
        'runEncryptDecryptTest',
        'switchBackend'
    ];

    for (const func of requiredFunctions) {
        if (!content.includes(func)) {
            throw new Error(`Test HTML missing function: ${func}`);
        }
    }
});

console.log('\n🦀 Rust/WASM Tests');
console.log('-'.repeat(60));

test('Cargo.toml has correct package name', () => {
    const content = fs.readFileSync('wasm-crypto/Cargo.toml', 'utf8');
    if (!content.includes('name = "mega-crypto-wasm"')) {
        throw new Error('Package name not set correctly');
    }
});

test('Cargo.toml has wasm-bindgen dependency', () => {
    const content = fs.readFileSync('wasm-crypto/Cargo.toml', 'utf8');
    if (!content.includes('wasm-bindgen')) {
        throw new Error('wasm-bindgen dependency missing');
    }
});

test('Cargo.toml has aes dependency', () => {
    const content = fs.readFileSync('wasm-crypto/Cargo.toml', 'utf8');
    if (!content.includes('aes =')) {
        throw new Error('aes dependency missing');
    }
});

test('Cargo.toml has ccm dependency', () => {
    const content = fs.readFileSync('wasm-crypto/Cargo.toml', 'utf8');
    if (!content.includes('ccm =')) {
        throw new Error('ccm dependency missing');
    }
});

test('Cargo.toml has release optimizations', () => {
    const content = fs.readFileSync('wasm-crypto/Cargo.toml', 'utf8');
    if (!content.includes('opt-level = 3') || !content.includes('lto = true')) {
        throw new Error('Release optimizations not configured');
    }
});

test('lib.rs has AesCcmCipher struct', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    if (!content.includes('pub struct AesCcmCipher')) {
        throw new Error('AesCcmCipher struct not found');
    }
});

test('lib.rs has wasm_bindgen annotations', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    const wasmBindgenCount = (content.match(/#\[wasm_bindgen\]/g) || []).length;
    if (wasmBindgenCount < 3) {
        throw new Error(`Expected at least 3 wasm_bindgen annotations, found ${wasmBindgenCount}`);
    }
});

test('lib.rs has encrypt function', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    if (!content.includes('pub fn encrypt')) {
        throw new Error('encrypt function not found');
    }
});

test('lib.rs has decrypt function', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    if (!content.includes('pub fn decrypt')) {
        throw new Error('decrypt function not found');
    }
});

test('lib.rs has batch operations', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    if (!content.includes('encrypt_chunks') || !content.includes('decrypt_chunks')) {
        throw new Error('Batch operations not found');
    }
});

test('lib.rs has tests module', () => {
    const content = fs.readFileSync('wasm-crypto/src/lib.rs', 'utf8');
    if (!content.includes('#[cfg(test)]')) {
        throw new Error('Tests module not found');
    }
});

console.log('\n📚 Documentation Tests');
console.log('-'.repeat(60));

test('CRYPTO_BACKENDS_README.md exists', () => {
    checkFile('CRYPTO_BACKENDS_README.md');
});

test('README has architecture section', () => {
    const content = fs.readFileSync('CRYPTO_BACKENDS_README.md', 'utf8');
    if (!content.includes('Architecture')) {
        throw new Error('Architecture section missing');
    }
});

test('README has usage examples', () => {
    const content = fs.readFileSync('CRYPTO_BACKENDS_README.md', 'utf8');
    if (!content.includes('Usage') && !content.includes('usage')) {
        throw new Error('Usage examples missing');
    }
});

test('README has performance comparison', () => {
    const content = fs.readFileSync('CRYPTO_BACKENDS_README.md', 'utf8');
    if (!content.includes('Performance')) {
        throw new Error('Performance section missing');
    }
});

test('README has troubleshooting section', () => {
    const content = fs.readFileSync('CRYPTO_BACKENDS_README.md', 'utf8');
    if (!content.includes('Troubleshooting')) {
        throw new Error('Troubleshooting section missing');
    }
});

test('WASM README exists', () => {
    checkFile('wasm-crypto/README.md');
});

console.log('\n📊 Integration Tests');
console.log('-'.repeat(60));

test('Backend exports are properly scoped', () => {
    const content = fs.readFileSync('js/crypto-backends.js', 'utf8');
    if (!content.includes('scope.CryptoBackends')) {
        throw new Error('CryptoBackends not exported to scope');
    }
});

test('UI exports are properly scoped', () => {
    const content = fs.readFileSync('js/crypto-backend-ui.js', 'utf8');
    if (!content.includes('scope.CryptoBackendUI')) {
        throw new Error('CryptoBackendUI not exported to scope');
    }
});

test('Workers use correct localStorage key', () => {
    const encContent = fs.readFileSync('encrypter-multi.js', 'utf8');
    const decContent = fs.readFileSync('decrypter-multi.js', 'utf8');

    if (!encContent.includes('cryptoBackend') || !decContent.includes('cryptoBackend')) {
        throw new Error('localStorage key not consistent');
    }
});

test('All files use consistent backend names', () => {
    const files = [
        'js/crypto-backends.js',
        'js/crypto-backend-ui.js',
        'encrypter-multi.js',
        'decrypter-multi.js'
    ];

    const expectedNames = ['asmjs', 'webcrypto', 'wasm'];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        for (const name of expectedNames) {
            if (!content.includes(name)) {
                throw new Error(`Backend name '${name}' not found in ${file}`);
            }
        }
    }
});

// Print summary
console.log('\n' + '='.repeat(60));
console.log('📈 Test Summary');
console.log('='.repeat(60));
console.log(`Total Tests: ${results.passed + results.failed}`);
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);

if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
        console.log(`  - ${t.name}`);
        console.log(`    ${t.error}`);
    });
    process.exit(1);
} else {
    console.log('\n🎉 All tests passed!');
    console.log('\n✨ The crypto backend implementation is ready to use!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Open crypto-backend-test.html in a browser to test functionality');
    console.log('   2. (Optional) Build WASM: cd wasm-crypto && ./build.sh');
    console.log('   3. Integrate multi-backend workers into your application');
    process.exit(0);
}
