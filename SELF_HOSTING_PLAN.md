# Self-Hosted Mega Webclient Implementation Plan

## Executive Summary

This document outlines the complete plan for making the Mega.nz webclient self-hostable on a custom domain/subdomain with optimized WASM-based encryption. The implementation is divided into two major phases: **Self-Hosting Configuration** and **WASM Crypto Optimization**.

---

## Phase 1: Self-Hosting Configuration

### 1.1 Current Architecture

The Mega webclient currently connects to:
- **API Endpoints**: `g.api.mega.co.nz` (production) or `staging.api.mega.co.nz` (staging)
- **Static Assets**: `eu.static.mega.co.nz`, `na.static.mega.co.nz`, `jp.static.mega.co.nz`
- **CDN Path**: Hardcoded to `/4/` version path

### 1.2 Domain Configuration Changes Required

#### File: `js/utils/api.js` (Line ~2391-2410)

**Current Code:**
```javascript
setAPIPath(aDomain, aSave) {
    if (aDomain === 'debug') {
        aDomain = `${location.host}:444`;
    }
    // ...
},

staging(aSave) {
    return this.setAPIPath('staging.api.mega.co.nz', aSave);
},

prod(aSave) {
    return this.setAPIPath('g.api.mega.co.nz', aSave);
}
```

**Required Changes:**
1. Add environment variable or configuration file support for custom API domains
2. Support `localStorage.apipath` for runtime override (already exists)
3. Create a `config.js` or use environment variables during build

**Recommended Approach:**
```javascript
// New config/endpoints.js file
export const API_CONFIG = {
    apiDomain: process.env.MEGA_API_DOMAIN || 'g.api.mega.co.nz',
    staticDomain: process.env.MEGA_STATIC_DOMAIN || 'eu.static.mega.co.nz',
    staticPath: process.env.MEGA_STATIC_PATH || '/4/',
};
```

#### File: `secureboot.js` (Line 12)

**Current Code:**
```javascript
var defaultStaticPath = 'https://eu.static.mega.co.nz/4/';
```

**Required Changes:**
```javascript
var defaultStaticPath = process.env.MEGA_STATIC_URL || 'https://eu.static.mega.co.nz/4/';
```

#### File: `Gruntfile.js` (Line 86)

**Current Code:**
```javascript
FS.endpoint = String(process.env.ENDPOINT || `prod`).toLowerCase();
```

**Required Changes:**
- Add support for custom endpoint configuration
- Support `.env` file or build-time configuration

### 1.3 Self-Hosting Implementation Steps

#### Step 1: Create Configuration System

**Create `config/self-host.config.js`:**
```javascript
module.exports = {
    // API Configuration
    apiDomain: process.env.MEGA_API_DOMAIN || 'api.yourdomain.com',
    apiPath: process.env.MEGA_API_PATH || '',

    // Static Assets
    staticDomain: process.env.MEGA_STATIC_DOMAIN || 'cdn.yourdomain.com',
    staticPath: process.env.MEGA_STATIC_PATH || '/assets/',

    // Feature Flags
    enableSecureboot: process.env.ENABLE_SECUREBOOT !== 'false',
    disableHashVerification: process.env.DISABLE_HASH_CHECK === 'true',

    // CORS Settings
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
};
```

**Create `.env.example`:**
```bash
# API Configuration
MEGA_API_DOMAIN=api.yourdomain.com
MEGA_API_PATH=/api/v1

# Static Assets
MEGA_STATIC_DOMAIN=cdn.yourdomain.com
MEGA_STATIC_PATH=/assets/

# Security
ENABLE_SECUREBOOT=false
DISABLE_HASH_CHECK=true

# CORS
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

#### Step 2: Update Build System

**Modify `Gruntfile.js`:**

1. Load environment variables from `.env` file using `dotenv`
2. Pass configuration to build process
3. Replace hardcoded domains during build

```javascript
require('dotenv').config();
const selfHostConfig = require('./config/self-host.config.js');

// Add to Grunt config
grunt.initConfig({
    replace: {
        endpoints: {
            options: {
                patterns: [
                    {
                        match: /g\.api\.mega\.co\.nz/g,
                        replacement: selfHostConfig.apiDomain
                    },
                    {
                        match: /eu\.static\.mega\.co\.nz/g,
                        replacement: selfHostConfig.staticDomain
                    },
                    // ... more replacements
                ]
            },
            files: [
                {expand: true, src: ['build/**/*.js', 'build/**/*.html']}
            ]
        }
    }
});
```

#### Step 3: Security Adjustments

**For Self-Hosting, you need to modify:**

1. **Secureboot Hash Verification** (`secureboot.js`):
   - Option A: Disable for self-hosting (less secure)
   - Option B: Generate new hashes during build process
   - Option C: Use Content-Security-Policy headers instead

2. **localStorage Settings for Development**:
   ```javascript
   localStorage.dd = 1;  // Disable hash verification
   localStorage.d = 1;   // Enable debug logging
   ```

#### Step 4: Deployment Configuration

**nginx Configuration Example:**
```nginx
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    root /var/www/mega-webclient/build;
    index index.html;

    # Enable CORS for your domains
    add_header Access-Control-Allow-Origin "https://yourdomain.com";
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Docker Configuration (Optional):**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source
COPY . .

# Build with environment variables
ARG MEGA_API_DOMAIN
ARG MEGA_STATIC_DOMAIN
ENV MEGA_API_DOMAIN=$MEGA_API_DOMAIN
ENV MEGA_STATIC_DOMAIN=$MEGA_STATIC_DOMAIN

RUN npm run build

# Serve with nginx
FROM nginx:alpine
COPY --from=0 /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## Phase 2: WASM Crypto Optimization

### 2.1 Current Crypto Implementation

**Status:**
- **No WebAssembly** currently in use
- Uses **ASM.js** for crypto operations (aesasm.js, rsaasm.js)
- **Total crypto code**: ~21KB (highly optimized)
- **Primary algorithm**: AES-128-CCM for file encryption/decryption
- **Worker-based**: Up to 8 parallel workers for encryption/decryption

**Key Files:**
- `/home/user/mega-webclient/js/crypto.js` (2,848 lines) - Main crypto module
- `/home/user/mega-webclient/aesasm.js` (3,048 lines) - AES implementation
- `/home/user/mega-webclient/rsaasm.js` (6,717 lines) - RSA implementation
- `/home/user/mega-webclient/encrypter.js` - Upload encryption worker
- `/home/user/mega-webclient/decrypter.js` - Download decryption worker

**Performance-Critical Paths:**
```
File Upload:   FileReader → Encrypter Workers → AES-128-CCM → Server
File Download: Stream → Decrypter Workers → AES-128-CCM → Write
Chunk Size:    1MB (0x100000 bytes) per worker
```

### 2.2 WASM Optimization Opportunities

#### Option 1: WebCrypto API (Easiest, 2-8x faster)

**Advantages:**
- Native browser implementation
- 2-8x performance improvement (based on code comments in codebase)
- No additional dependencies
- Better memory safety
- Hardware acceleration on supported platforms

**Implementation:**
```javascript
// Current: asmCrypto
const cipher = new asmCrypto.AES_CCM(key, nonce);
const encrypted = cipher.encrypt(data);

// Proposed: WebCrypto API
const keyObject = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
);

const encrypted = await crypto.subtle.encrypt(
    {
        name: 'AES-GCM',
        iv: nonce,
        tagLength: 128
    },
    keyObject,
    data
);
```

**Migration Path:**
1. Create abstraction layer in `js/crypto.js`
2. Implement WebCrypto backend
3. Keep ASM.js as fallback
4. A/B test performance
5. Gradually migrate

**Files to Modify:**
- `js/crypto.js` - Add WebCrypto abstraction
- `encrypter.js` - Use WebCrypto in worker
- `decrypter.js` - Use WebCrypto in worker
- `aesasm.js` - Keep as fallback

#### Option 2: Custom WASM Implementation (Best Performance)

**Advantages:**
- Maximum performance (potentially 10-20x faster for large files)
- Full control over implementation
- Memory-safe (Rust/C++)
- Can optimize for specific use case

**Recommended Approach:**

**Use Rust + wasm-bindgen**

**Project Structure:**
```
wasm-crypto/
├── Cargo.toml
├── src/
│   ├── lib.rs           # WASM entry point
│   ├── aes_ccm.rs       # AES-128-CCM implementation
│   ├── rsa.rs           # RSA operations
│   └── utils.rs         # Helper functions
└── pkg/                 # Built WASM output
```

**Cargo.toml:**
```toml
[package]
name = "mega-crypto-wasm"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
aes = "0.8"
ccm = "0.5"
rsa = "0.9"
rand = "0.8"
getrandom = { version = "0.2", features = ["js"] }

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
```

**src/lib.rs:**
```rust
use wasm_bindgen::prelude::*;
use aes::Aes128;
use ccm::{Ccm, KeyInit, aead::Aead};

type Aes128Ccm = Ccm<Aes128, U8, U16>;

#[wasm_bindgen]
pub struct AesCcmCipher {
    key: Vec<u8>,
}

#[wasm_bindgen]
impl AesCcmCipher {
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8]) -> Result<AesCcmCipher, JsValue> {
        if key.len() != 16 {
            return Err(JsValue::from_str("Key must be 16 bytes"));
        }
        Ok(AesCcmCipher {
            key: key.to_vec(),
        })
    }

    #[wasm_bindgen]
    pub fn encrypt(&self, nonce: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, JsValue> {
        let cipher = Aes128Ccm::new_from_slice(&self.key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let ciphertext = cipher.encrypt(nonce.into(), plaintext)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(ciphertext)
    }

    #[wasm_bindgen]
    pub fn decrypt(&self, nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, JsValue> {
        let cipher = Aes128Ccm::new_from_slice(&self.key)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let plaintext = cipher.decrypt(nonce.into(), ciphertext)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        Ok(plaintext)
    }
}

// Batch processing for better performance
#[wasm_bindgen]
pub fn encrypt_chunks(
    key: &[u8],
    nonce_base: &[u8],
    chunks: Vec<Vec<u8>>
) -> Result<Vec<Vec<u8>>, JsValue> {
    let cipher = AesCcmCipher::new(key)?;
    let mut results = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let mut nonce = nonce_base.to_vec();
        nonce.extend_from_slice(&(i as u64).to_be_bytes());

        let encrypted = cipher.encrypt(&nonce, chunk)?;
        results.push(encrypted);
    }

    Ok(results)
}
```

**Build Script:**
```bash
#!/bin/bash
cd wasm-crypto
wasm-pack build --target web --out-dir ../js/wasm
```

**Integration in `encrypter.js`:**
```javascript
import init, { AesCcmCipher, encrypt_chunks } from './wasm/mega_crypto_wasm.js';

let wasmInitialized = false;
let useWasm = true;

async function initWasm() {
    if (!wasmInitialized) {
        try {
            await init();
            wasmInitialized = true;
        } catch (e) {
            console.warn('WASM initialization failed, falling back to ASM.js', e);
            useWasm = false;
        }
    }
}

self.onmessage = async function(e) {
    await initWasm();

    const { id, key, chunks } = e.data;

    if (useWasm) {
        try {
            const cipher = new AesCcmCipher(key);
            const encrypted = cipher.encrypt(nonce, chunks[0]);

            self.postMessage({ id, result: encrypted });
            return;
        } catch (err) {
            console.warn('WASM encryption failed, falling back', err);
            useWasm = false;
        }
    }

    // Fallback to ASM.js
    const cipher = new asmCrypto.AES_CCM(key, nonce);
    const encrypted = cipher.encrypt(chunks[0]);
    self.postMessage({ id, result: encrypted });
};
```

#### Option 3: Hybrid Approach (Recommended)

**Strategy:**
1. **Phase 2.1**: Implement WebCrypto API for supported browsers
2. **Phase 2.2**: Implement WASM for maximum performance
3. **Fallback**: Keep ASM.js for older browsers

**Detection Logic:**
```javascript
// js/crypto.js
const CryptoBackend = {
    WASM: 'wasm',
    WEBCRYPTO: 'webcrypto',
    ASMJS: 'asmjs'
};

async function detectBestBackend() {
    // Try WASM first
    if (typeof WebAssembly !== 'undefined') {
        try {
            await WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
            return CryptoBackend.WASM;
        } catch (e) {
            console.warn('WASM not supported');
        }
    }

    // Try WebCrypto
    if (window.crypto && window.crypto.subtle) {
        return CryptoBackend.WEBCRYPTO;
    }

    // Fallback to ASM.js
    return CryptoBackend.ASMJS;
}
```

### 2.3 Performance Expectations

**Current (ASM.js):**
- ~50-100 MB/s encryption/decryption (varies by device)
- 1MB chunks processed per worker

**With WebCrypto API:**
- ~200-800 MB/s (2-8x improvement)
- Hardware acceleration support

**With Custom WASM:**
- ~500-2000 MB/s (10-20x improvement)
- Optimized for large files
- Better memory management

### 2.4 Testing Strategy

1. **Unit Tests**: Test each backend independently
2. **Integration Tests**: Test worker communication
3. **Performance Benchmarks**: Compare all backends
4. **Browser Compatibility**: Test on all supported browsers
5. **Regression Tests**: Ensure encrypted files are compatible

---

## Phase 3: Implementation Timeline

### Milestone 1: Self-Hosting Setup (Week 1-2)
- [ ] Create configuration system
- [ ] Update Gruntfile.js with environment variable support
- [ ] Modify api.js for custom domains
- [ ] Update secureboot.js
- [ ] Test local deployment
- [ ] Create nginx/Docker deployment configurations
- [ ] Write deployment documentation

### Milestone 2: WebCrypto Migration (Week 3-4)
- [ ] Create crypto abstraction layer
- [ ] Implement WebCrypto backend
- [ ] Update worker files
- [ ] Browser compatibility testing
- [ ] Performance benchmarking
- [ ] A/B testing in production

### Milestone 3: WASM Development (Week 5-8)
- [ ] Set up Rust/wasm-bindgen project
- [ ] Implement AES-128-CCM in Rust
- [ ] Implement RSA operations
- [ ] Build WASM modules
- [ ] Integration with workers
- [ ] Comprehensive testing
- [ ] Performance validation

### Milestone 4: Optimization & Polish (Week 9-10)
- [ ] Optimize WASM size (<100KB target)
- [ ] Implement lazy loading for WASM
- [ ] Memory profiling and optimization
- [ ] Security audit
- [ ] Documentation
- [ ] Final testing

---

## Phase 4: Security Considerations

### 4.1 Self-Hosting Security

1. **Disable Secureboot Hash Verification**
   - Current implementation verifies hashes from Mega servers
   - For self-hosting: Generate hashes during build or disable

2. **HTTPS Required**
   - All crypto operations require secure context
   - Use Let's Encrypt for free SSL certificates

3. **CORS Configuration**
   - Properly configure CORS headers
   - Restrict to trusted domains only

4. **Content Security Policy**
   - Update CSP headers for custom domains
   - Allow WebAssembly if using WASM backend

### 4.2 Crypto Security

1. **Memory Clearing**
   - Implement explicit memory zeroing for sensitive data
   - Use Rust's `zeroize` crate for WASM

2. **Side-Channel Protection**
   - Use constant-time operations where possible
   - Rust crypto crates provide this by default

3. **Key Management**
   - Keys never leave the browser
   - Secure storage using browser APIs

---

## Phase 5: Deployment Checklist

### Pre-Deployment
- [ ] Create `.env` file with custom domains
- [ ] Update configuration files
- [ ] Build project with `npm run build`
- [ ] Generate new secureboot hashes (optional)
- [ ] Set up SSL certificates
- [ ] Configure web server (nginx/Apache)

### Deployment
- [ ] Deploy built files to web server
- [ ] Configure DNS for subdomain
- [ ] Test API connectivity
- [ ] Test static asset loading
- [ ] Verify crypto operations work
- [ ] Check browser console for errors

### Post-Deployment
- [ ] Monitor performance metrics
- [ ] Check error logs
- [ ] User acceptance testing
- [ ] Load testing
- [ ] Security scanning

---

## Additional Resources

### Dependencies to Add

```json
{
  "dependencies": {
    "dotenv": "^16.0.0",
    "grunt-string-replace": "^1.3.2"
  },
  "devDependencies": {
    "wasm-pack": "^0.12.0"
  }
}
```

### Useful Commands

```bash
# Build with custom configuration
MEGA_API_DOMAIN=api.yourdomain.com npm run build

# Development with local API
npm run dev

# Build WASM module
cd wasm-crypto && wasm-pack build --target web

# Docker deployment
docker build -t mega-webclient \
  --build-arg MEGA_API_DOMAIN=api.yourdomain.com \
  --build-arg MEGA_STATIC_DOMAIN=cdn.yourdomain.com \
  .

docker run -p 80:80 mega-webclient
```

---

## Conclusion

This plan provides a comprehensive roadmap for:
1. **Self-hosting** the Mega webclient on custom domains
2. **Optimizing** crypto performance with WebCrypto API and/or WASM

**Estimated Total Time**: 8-10 weeks (depending on complexity)

**Key Success Metrics**:
- Successfully deploy on custom subdomain
- 2-20x crypto performance improvement
- Maintain security and compatibility
- Full feature parity with original

**Risk Mitigation**:
- Phased approach with fallbacks
- Comprehensive testing at each stage
- Keep ASM.js as safety net
- Regular security audits
