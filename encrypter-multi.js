/**
 * Multi-backend Encrypter Worker
 * Supports ASM.js (default), WebCrypto API, and WASM backends
 */

// Import old ASM.js for fallback
importScripts('aesasm.js');
importScripts('js/crypto-backends.js');

postMessage = self.webkitPostMessage || self.postMessage;

// Worker state
let backend = null;
let currentBackendType = null;
let key = null;
let nonce = new Uint8Array(8);
let iv = new Uint8Array(16);
let ctr = 0;

// ASM.js fallback (legacy mode)
let heap = new Uint8Array(0x200000);
let asm = aes_asm(self, null, heap.buffer);

/**
 * Initialize the crypto backend
 */
async function initBackend(backendType) {
    if (currentBackendType === backendType && backend) {
        return; // Already initialized
    }

    try {
        backend = await CryptoBackends.createBackend(backendType);
        currentBackendType = backendType;
        console.log('Encrypter worker initialized with backend:', backendType);
    } catch (e) {
        console.error('Failed to initialize backend:', e);
        // Fallback to ASM.js
        backend = await CryptoBackends.createBackend(CryptoBackends.BACKENDS.ASMJS);
        currentBackendType = CryptoBackends.BACKENDS.ASMJS;
    }
}

/**
 * Legacy ASM.js encryption (for compatibility)
 */
function legacyEncrypt(data) {
    const heapView = new DataView(heap.buffer);
    const macs = [];
    let localCtr = ctr;

    for (let i = 0; i < data.length; i += 0x100000) {
        // put data chunk into the heap
        const j = (i + 0x100000 < data.length) ? i + 0x100000 : data.length;
        heap.set(data.subarray(i, j), 0x1000);

        // init mac state
        asm.init_state.apply(asm, iv);

        // encrypt data
        asm.ccm_encrypt(
            0x1000, j - i,
            nonce[0], nonce[1], nonce[2], nonce[3],
            nonce[4], nonce[5], nonce[6], nonce[7],
            0, 0, 0, 0, 0, 0,
            (localCtr / 0x100000000) >>> 0, localCtr >>> 0
        );

        // get encrypted data from the heap
        data.set(heap.subarray(0x1000, 0x1000 + j - i), i);

        // store mac
        asm.save_state(0x1000);
        macs.push(heapView.getUint32(0x1000, false));
        macs.push(heapView.getUint32(0x1004, false));
        macs.push(heapView.getUint32(0x1008, false));
        macs.push(heapView.getUint32(0x100c, false));

        // adjust counter
        localCtr += Math.ceil((j - i) / 16);
    }

    ctr = localCtr;
    return { data, macs };
}

/**
 * Modern backend encryption
 */
async function modernEncrypt(data) {
    if (!backend) {
        throw new Error('Backend not initialized');
    }

    const result = await backend.encrypt(key, nonce, ctr, data);

    // Update counter
    ctr += Math.ceil(data.length / 16);

    return {
        data: result.encrypted,
        macs: result.macs
    };
}

/**
 * Message handler
 */
onmessage = async function(e) {
    try {
        if (typeof e.data === 'string') {
            // Key initialization
            const arr = JSON.parse(e.data);

            const nonceView = new DataView(nonce.buffer);
            nonceView.setUint32(0, arr[4], false);
            nonceView.setUint32(4, arr[5], false);
            iv.set(nonce, 0);
            iv.set(nonce, 8);

            key = new Uint8Array(16);
            const keyView = new DataView(key.buffer);
            keyView.setUint32(0, arr[0], false);
            keyView.setUint32(4, arr[1], false);
            keyView.setUint32(8, arr[2], false);
            keyView.setUint32(12, arr[3], false);

            // Also initialize legacy ASM.js
            asm.init_key_128.apply(asm, key);
        }
        else if (typeof e.data === 'number') {
            // Counter update
            ctr = e.data;
        }
        else if (e.data && e.data.type === 'setBackend') {
            // Backend selection
            await initBackend(e.data.backend);
            postMessage({ type: 'backendSet', backend: currentBackendType });
        }
        else if (e.data && e.data.type === 'getBackend') {
            // Query current backend
            postMessage({ type: 'currentBackend', backend: currentBackendType });
        }
        else {
            // Encryption request
            let data = new Uint8Array(e.data.buffer || e.data);
            let result;

            // Get preferred backend
            const preferredBackend = localStorage.getItem('cryptoBackend') || CryptoBackends.BACKENDS.ASMJS;

            // Initialize backend if needed
            if (!backend || currentBackendType !== preferredBackend) {
                await initBackend(preferredBackend);
            }

            // Perform encryption
            if (currentBackendType === CryptoBackends.BACKENDS.ASMJS) {
                result = legacyEncrypt(data);
            } else {
                result = await modernEncrypt(data);
            }

            // Send results
            postMessage(JSON.stringify(result.macs));

            if (typeof MSBlobBuilder === "function") {
                postMessage(result.data);
            } else {
                postMessage(result.data.buffer, [result.data.buffer]);
            }
        }
    } catch (error) {
        console.error('Encrypter worker error:', error);
        postMessage({ type: 'error', message: error.message });
    }
};

// Initialize with default backend on startup
initBackend(CryptoBackends.BACKENDS.ASMJS).catch(console.error);
