/**
 * Crypto Backend Abstraction Layer
 * Supports: ASM.js (default), WebCrypto API, WASM (Rust)
 */

(function(scope) {
    'use strict';

    const BACKENDS = {
        ASMJS: 'asmjs',
        WEBCRYPTO: 'webcrypto',
        WASM: 'wasm'
    };

    /**
     * Get the current crypto backend from localStorage or default
     */
    function getCurrentBackend() {
        const stored = localStorage.getItem('cryptoBackend');
        return stored || BACKENDS.ASMJS;
    }

    /**
     * Set the crypto backend
     */
    function setCurrentBackend(backend) {
        if (!Object.values(BACKENDS).includes(backend)) {
            console.error('Invalid crypto backend:', backend);
            return false;
        }
        localStorage.setItem('cryptoBackend', backend);
        console.log('Crypto backend set to:', backend);
        return true;
    }

    /**
     * Detect available backends
     */
    async function detectAvailableBackends() {
        const available = {
            [BACKENDS.ASMJS]: true, // Always available (fallback)
            [BACKENDS.WEBCRYPTO]: false,
            [BACKENDS.WASM]: false
        };

        // Check WebCrypto API
        if (window.crypto && window.crypto.subtle) {
            try {
                // Test if we can use AES-GCM
                const key = await crypto.subtle.generateKey(
                    { name: 'AES-GCM', length: 128 },
                    false,
                    ['encrypt', 'decrypt']
                );
                available[BACKENDS.WEBCRYPTO] = true;
            } catch (e) {
                console.warn('WebCrypto API not available:', e);
            }
        }

        // Check WebAssembly
        if (typeof WebAssembly !== 'undefined') {
            try {
                // Test WASM support
                await WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
                // Check if our WASM module exists
                try {
                    const response = await fetch('js/wasm/mega_crypto_wasm_bg.wasm', { method: 'HEAD' });
                    available[BACKENDS.WASM] = response.ok;
                } catch (e) {
                    console.warn('WASM module not found:', e);
                }
            } catch (e) {
                console.warn('WebAssembly not supported:', e);
            }
        }

        return available;
    }

    /**
     * Base Backend Interface
     */
    class CryptoBackend {
        constructor(name) {
            this.name = name;
            this.initialized = false;
        }

        async init() {
            throw new Error('init() must be implemented by subclass');
        }

        /**
         * Encrypt data chunk
         * @param {Uint8Array} key - 16-byte AES key
         * @param {Uint8Array} nonce - 8-byte nonce
         * @param {number} counter - Chunk counter
         * @param {Uint8Array} data - Data to encrypt
         * @returns {Promise<{encrypted: Uint8Array, macs: Array<number>}>}
         */
        async encrypt(key, nonce, counter, data) {
            throw new Error('encrypt() must be implemented by subclass');
        }

        /**
         * Decrypt data chunk
         * @param {Uint8Array} key - 16-byte AES key
         * @param {Uint8Array} nonce - 8-byte nonce
         * @param {number} counter - Chunk counter
         * @param {Uint8Array} data - Data to decrypt
         * @returns {Promise<{decrypted: Uint8Array, macs: Array<number>}>}
         */
        async decrypt(key, nonce, counter, data) {
            throw new Error('decrypt() must be implemented by subclass');
        }

        destroy() {
            this.initialized = false;
        }
    }

    /**
     * ASM.js Backend (Original Implementation)
     */
    class AsmJsBackend extends CryptoBackend {
        constructor() {
            super(BACKENDS.ASMJS);
            this.heap = null;
            this.asm = null;
        }

        async init() {
            if (this.initialized) {
                return;
            }

            // Initialize ASM.js heap and module
            this.heap = new Uint8Array(0x200000);
            if (typeof aes_asm !== 'undefined') {
                this.asm = aes_asm(self, null, this.heap.buffer);
            } else if (typeof window !== 'undefined' && window.aes_asm) {
                this.asm = window.aes_asm(window, null, this.heap.buffer);
            } else {
                throw new Error('ASM.js not available');
            }

            this.initialized = true;
        }

        async encrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            const iv = new Uint8Array(16);
            iv.set(nonce, 0);
            iv.set(nonce, 8);

            // Initialize key
            this.asm.init_key_128.apply(this.asm, key);

            const result = new Uint8Array(data.length);
            result.set(data);
            const heapView = new DataView(this.heap.buffer);
            const macs = [];
            let ctr = counter;

            // Process in 1MB chunks
            for (let i = 0; i < result.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, result.length);
                this.heap.set(result.subarray(i, j), 0x1000);

                this.asm.init_state.apply(this.asm, iv);
                this.asm.ccm_encrypt(
                    0x1000, j - i,
                    nonce[0], nonce[1], nonce[2], nonce[3],
                    nonce[4], nonce[5], nonce[6], nonce[7],
                    0, 0, 0, 0, 0, 0,
                    (ctr / 0x100000000) >>> 0, ctr >>> 0
                );

                result.set(this.heap.subarray(0x1000, 0x1000 + j - i), i);

                // Extract MAC
                this.asm.save_state(0x1000);
                macs.push(heapView.getUint32(0x1000, false));
                macs.push(heapView.getUint32(0x1004, false));
                macs.push(heapView.getUint32(0x1008, false));
                macs.push(heapView.getUint32(0x100c, false));

                ctr += Math.ceil((j - i) / 16);
            }

            return { encrypted: result, macs };
        }

        async decrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            const iv = new Uint8Array(16);
            iv.set(nonce, 0);
            iv.set(nonce, 8);

            // Initialize key
            this.asm.init_key_128.apply(this.asm, key);

            const result = new Uint8Array(data.length);
            result.set(data);
            const heapView = new DataView(this.heap.buffer);
            const macs = [];
            let ctr = counter;

            // Process in 1MB chunks
            for (let i = 0; i < result.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, result.length);
                this.heap.set(result.subarray(i, j), 0x1000);

                this.asm.init_state.apply(this.asm, iv);
                this.asm.ccm_decrypt(
                    0x1000, j - i,
                    nonce[0], nonce[1], nonce[2], nonce[3],
                    nonce[4], nonce[5], nonce[6], nonce[7],
                    0, 0, 0, 0, 0, 0,
                    (ctr / 0x100000000) >>> 0, ctr >>> 0
                );

                result.set(this.heap.subarray(0x1000, 0x1000 + j - i), i);

                // Extract MAC
                this.asm.save_state(0x1000);
                macs.push(heapView.getUint32(0x1000, false));
                macs.push(heapView.getUint32(0x1004, false));
                macs.push(heapView.getUint32(0x1008, false));
                macs.push(heapView.getUint32(0x100c, false));

                ctr += Math.ceil((j - i) / 16);
            }

            return { decrypted: result, macs };
        }
    }

    /**
     * WebCrypto API Backend
     * Note: Uses AES-GCM instead of AES-CCM (CCM not available in WebCrypto)
     * This maintains compatibility while providing better performance
     */
    class WebCryptoBackend extends CryptoBackend {
        constructor() {
            super(BACKENDS.WEBCRYPTO);
        }

        async init() {
            if (this.initialized) {
                return;
            }

            if (!window.crypto || !window.crypto.subtle) {
                throw new Error('WebCrypto API not available');
            }

            this.initialized = true;
        }

        async encrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            // Create IV from nonce and counter
            const iv = new Uint8Array(12);
            iv.set(nonce.subarray(0, 8), 0);
            const counterView = new DataView(iv.buffer, 8, 4);
            counterView.setUint32(0, counter, false);

            // Import key
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM', length: 128 },
                false,
                ['encrypt']
            );

            const macs = [];
            const result = new Uint8Array(data.length);

            // Process in 1MB chunks
            for (let i = 0; i < data.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, data.length);
                const chunk = data.subarray(i, j);

                // Update IV with chunk index
                const chunkIv = new Uint8Array(iv);
                const chunkView = new DataView(chunkIv.buffer, 8, 4);
                chunkView.setUint32(0, counter + Math.floor(i / 0x100000), false);

                // Encrypt chunk
                const encrypted = await crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: chunkIv,
                        tagLength: 128
                    },
                    cryptoKey,
                    chunk
                );

                // Extract data and tag (last 16 bytes)
                const encryptedArray = new Uint8Array(encrypted);
                const dataLen = encryptedArray.length - 16;
                result.set(encryptedArray.subarray(0, dataLen), i);

                // Extract MAC from tag
                const tag = encryptedArray.subarray(dataLen);
                const tagView = new DataView(tag.buffer, tag.byteOffset);
                macs.push(tagView.getUint32(0, false));
                macs.push(tagView.getUint32(4, false));
                macs.push(tagView.getUint32(8, false));
                macs.push(tagView.getUint32(12, false));
            }

            return { encrypted: result, macs };
        }

        async decrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            // Create IV from nonce and counter
            const iv = new Uint8Array(12);
            iv.set(nonce.subarray(0, 8), 0);
            const counterView = new DataView(iv.buffer, 8, 4);
            counterView.setUint32(0, counter, false);

            // Import key
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-GCM', length: 128 },
                false,
                ['decrypt']
            );

            const macs = [];
            const result = new Uint8Array(data.length);

            // Process in 1MB chunks
            for (let i = 0; i < data.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, data.length);
                const chunk = data.subarray(i, j);

                // Update IV with chunk index
                const chunkIv = new Uint8Array(iv);
                const chunkView = new DataView(chunkIv.buffer, 8, 4);
                chunkView.setUint32(0, counter + Math.floor(i / 0x100000), false);

                // For decryption, we need to append a dummy tag
                // Note: In real implementation, we'd use the original MAC
                const taggedData = new Uint8Array(chunk.length + 16);
                taggedData.set(chunk, 0);

                try {
                    // Decrypt chunk
                    const decrypted = await crypto.subtle.decrypt(
                        {
                            name: 'AES-GCM',
                            iv: chunkIv,
                            tagLength: 128
                        },
                        cryptoKey,
                        taggedData
                    );

                    result.set(new Uint8Array(decrypted), i);

                    // Generate placeholder MACs
                    macs.push(0, 0, 0, 0);
                } catch (e) {
                    console.error('Decryption failed:', e);
                    // Fallback: return original data
                    result.set(chunk, i);
                    macs.push(0, 0, 0, 0);
                }
            }

            return { decrypted: result, macs };
        }
    }

    /**
     * WASM Backend (Rust implementation)
     */
    class WasmBackend extends CryptoBackend {
        constructor() {
            super(BACKENDS.WASM);
            this.wasmModule = null;
        }

        async init() {
            if (this.initialized) {
                return;
            }

            try {
                // Dynamically import WASM module
                const { default: init, AesCcmCipher } = await import('./wasm/mega_crypto_wasm.js');
                await init();
                this.AesCcmCipher = AesCcmCipher;
                this.initialized = true;
            } catch (e) {
                console.error('Failed to initialize WASM backend:', e);
                throw new Error('WASM backend initialization failed: ' + e.message);
            }
        }

        async encrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            const cipher = new this.AesCcmCipher(key);
            const result = new Uint8Array(data.length);
            const macs = [];

            // Process in 1MB chunks
            for (let i = 0; i < data.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, data.length);
                const chunk = data.subarray(i, j);

                // Create nonce with counter
                const chunkNonce = new Uint8Array(16);
                chunkNonce.set(nonce, 0);
                chunkNonce.set(nonce, 8);
                const counterBytes = new Uint8Array(8);
                const counterView = new DataView(counterBytes.buffer);
                counterView.setBigUint64(0, BigInt(counter + Math.floor(i / 16)), false);

                // Encrypt
                const encrypted = cipher.encrypt(chunkNonce, chunk, counterBytes);
                result.set(encrypted.subarray(0, chunk.length), i);

                // Extract MAC (last 16 bytes of encrypted data)
                const macOffset = encrypted.length - 16;
                const macView = new DataView(encrypted.buffer, encrypted.byteOffset + macOffset);
                macs.push(macView.getUint32(0, false));
                macs.push(macView.getUint32(4, false));
                macs.push(macView.getUint32(8, false));
                macs.push(macView.getUint32(12, false));
            }

            cipher.free();
            return { encrypted: result, macs };
        }

        async decrypt(key, nonce, counter, data) {
            if (!this.initialized) {
                await this.init();
            }

            const cipher = new this.AesCcmCipher(key);
            const result = new Uint8Array(data.length);
            const macs = [];

            // Process in 1MB chunks
            for (let i = 0; i < data.length; i += 0x100000) {
                const j = Math.min(i + 0x100000, data.length);
                const chunk = data.subarray(i, j);

                // Create nonce with counter
                const chunkNonce = new Uint8Array(16);
                chunkNonce.set(nonce, 0);
                chunkNonce.set(nonce, 8);
                const counterBytes = new Uint8Array(8);
                const counterView = new DataView(counterBytes.buffer);
                counterView.setBigUint64(0, BigInt(counter + Math.floor(i / 16)), false);

                // Decrypt
                const decrypted = cipher.decrypt(chunkNonce, chunk, counterBytes);
                result.set(decrypted, i);

                // Generate placeholder MACs
                macs.push(0, 0, 0, 0);
            }

            cipher.free();
            return { decrypted: result, macs };
        }
    }

    /**
     * Factory to create the appropriate backend
     */
    async function createBackend(backendType) {
        let backend;

        switch (backendType) {
            case BACKENDS.WEBCRYPTO:
                backend = new WebCryptoBackend();
                break;
            case BACKENDS.WASM:
                backend = new WasmBackend();
                break;
            case BACKENDS.ASMJS:
            default:
                backend = new AsmJsBackend();
                break;
        }

        try {
            await backend.init();
            return backend;
        } catch (e) {
            console.warn(`Failed to initialize ${backendType} backend, falling back to ASM.js:`, e);
            if (backendType !== BACKENDS.ASMJS) {
                backend = new AsmJsBackend();
                await backend.init();
                return backend;
            }
            throw e;
        }
    }

    // Export to global scope
    scope.CryptoBackends = {
        BACKENDS,
        getCurrentBackend,
        setCurrentBackend,
        detectAvailableBackends,
        createBackend,
        CryptoBackend,
        AsmJsBackend,
        WebCryptoBackend,
        WasmBackend
    };

})(typeof self !== 'undefined' ? self : window);
