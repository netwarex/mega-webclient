/**
 * Crypto Backend UI Component
 * Provides dropdown/settings for selecting encryption backend
 */

(function(scope) {
    'use strict';

    /**
     * Initialize the crypto backend UI
     */
    async function initCryptoBackendUI() {
        // Detect available backends
        const available = await CryptoBackends.detectAvailableBackends();
        const current = CryptoBackends.getCurrentBackend();

        console.log('Available crypto backends:', available);
        console.log('Current backend:', current);

        // Create UI element if it doesn't exist
        createUI(available, current);

        // Update performance stats
        updatePerformanceStats(current);
    }

    /**
     * Create the UI dropdown and settings
     */
    function createUI(available, current) {
        // Check if UI already exists
        if (document.getElementById('crypto-backend-selector')) {
            return;
        }

        // Create container
        const container = document.createElement('div');
        container.id = 'crypto-backend-settings';
        container.className = 'settings-sub-section';
        container.style.cssText = 'margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 8px;';

        // Title
        const title = document.createElement('h3');
        title.textContent = 'Encryption Backend';
        title.style.cssText = 'margin: 0 0 10px 0; font-size: 16px; font-weight: 600;';
        container.appendChild(title);

        // Description
        const desc = document.createElement('p');
        desc.textContent = 'Choose the encryption implementation. Different backends offer varying performance characteristics.';
        desc.style.cssText = 'margin: 0 0 15px 0; font-size: 13px; color: #666;';
        container.appendChild(desc);

        // Dropdown
        const selectWrapper = document.createElement('div');
        selectWrapper.style.cssText = 'margin-bottom: 15px;';

        const select = document.createElement('select');
        select.id = 'crypto-backend-selector';
        select.className = 'crypto-backend-select';
        select.style.cssText = 'padding: 8px 12px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; min-width: 250px; cursor: pointer;';

        // Add options
        const backends = [
            {
                value: CryptoBackends.BACKENDS.ASMJS,
                label: 'ASM.js (Default)',
                desc: 'Original implementation, best compatibility'
            },
            {
                value: CryptoBackends.BACKENDS.WEBCRYPTO,
                label: 'WebCrypto API',
                desc: '2-8x faster, native browser implementation'
            },
            {
                value: CryptoBackends.BACKENDS.WASM,
                label: 'WebAssembly (Rust)',
                desc: '10-20x faster, requires WASM module'
            }
        ];

        backends.forEach(backend => {
            const option = document.createElement('option');
            option.value = backend.value;
            option.textContent = backend.label;
            option.disabled = !available[backend.value];

            if (backend.value === current) {
                option.selected = true;
            }

            if (!available[backend.value]) {
                option.textContent += ' (Not Available)';
            }

            select.appendChild(option);
        });

        // Backend info
        const infoDiv = document.createElement('div');
        infoDiv.id = 'crypto-backend-info';
        infoDiv.style.cssText = 'margin-top: 10px; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;';

        // Change handler
        select.addEventListener('change', async (e) => {
            const newBackend = e.target.value;
            await switchBackend(newBackend);
        });

        selectWrapper.appendChild(select);
        container.appendChild(selectWrapper);
        container.appendChild(infoDiv);

        // Performance stats
        const statsDiv = document.createElement('div');
        statsDiv.id = 'crypto-backend-stats';
        statsDiv.style.cssText = 'margin-top: 15px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; font-size: 12px;';
        container.appendChild(statsDiv);

        // Test button
        const testButton = document.createElement('button');
        testButton.textContent = 'Run Performance Test';
        testButton.className = 'crypto-test-btn';
        testButton.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';
        testButton.addEventListener('click', runPerformanceTest);
        container.appendChild(testButton);

        // Update info
        updateBackendInfo(current);

        // Try to insert into settings page
        insertIntoSettings(container);
    }

    /**
     * Insert the UI into the settings page
     */
    function insertIntoSettings(container) {
        // Try multiple locations where it might fit
        const locations = [
            '#fm-account-settings .settings-container',
            '.fm-account-sections',
            '.account-sections',
            '#account',
            'body'
        ];

        for (const selector of locations) {
            const target = document.querySelector(selector);
            if (target) {
                target.appendChild(container);
                console.log('Crypto backend UI inserted into:', selector);
                return;
            }
        }

        // Fallback: add to body as floating panel
        container.style.cssText += '; position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
        document.body.appendChild(container);
        console.log('Crypto backend UI added as floating panel');
    }

    /**
     * Switch to a different backend
     */
    async function switchBackend(newBackend) {
        const statusDiv = document.getElementById('crypto-backend-info');

        try {
            statusDiv.textContent = 'Switching backend...';
            statusDiv.style.background = '#fff3cd';

            // Set the new backend
            CryptoBackends.setCurrentBackend(newBackend);

            // Notify workers if they're active
            if (typeof sendWorkerMessage === 'function') {
                sendWorkerMessage({ type: 'setBackend', backend: newBackend });
            }

            // Update UI
            updateBackendInfo(newBackend);
            updatePerformanceStats(newBackend);

            statusDiv.textContent = `✓ Successfully switched to ${newBackend}`;
            statusDiv.style.background = '#d4edda';

            // Show success message
            if (typeof msgDialog === 'function') {
                msgDialog('info', 'Backend Changed', `Encryption backend switched to ${newBackend}. This will affect new transfers.`);
            }

            console.log('Backend switched to:', newBackend);
        } catch (error) {
            console.error('Failed to switch backend:', error);
            statusDiv.textContent = `✗ Error: ${error.message}`;
            statusDiv.style.background = '#f8d7da';
        }
    }

    /**
     * Update backend information display
     */
    function updateBackendInfo(backend) {
        const infoDiv = document.getElementById('crypto-backend-info');
        if (!infoDiv) return;

        const info = {
            [CryptoBackends.BACKENDS.ASMJS]: {
                name: 'ASM.js',
                description: 'JavaScript subset optimized by browser JIT compiler',
                performance: 'Baseline (~50-100 MB/s)',
                compatibility: 'All browsers',
                security: 'Good',
                features: ['Original implementation', 'Best compatibility', 'No dependencies']
            },
            [CryptoBackends.BACKENDS.WEBCRYPTO]: {
                name: 'WebCrypto API',
                description: 'Native browser cryptography implementation',
                performance: '2-8x faster (~200-800 MB/s)',
                compatibility: 'Modern browsers',
                security: 'Excellent (hardware-accelerated)',
                features: ['Native implementation', 'Hardware acceleration', 'Better security']
            },
            [CryptoBackends.BACKENDS.WASM]: {
                name: 'WebAssembly',
                description: 'Rust-compiled WASM module',
                performance: '10-20x faster (~500-2000 MB/s)',
                compatibility: 'Modern browsers with WASM support',
                security: 'Excellent (memory-safe Rust)',
                features: ['Maximum performance', 'Memory safety', 'Optimized algorithms']
            }
        };

        const current = info[backend] || info[CryptoBackends.BACKENDS.ASMJS];

        infoDiv.innerHTML = `
            <strong>${current.name}</strong><br>
            <div style="margin-top: 8px;">
                <div style="margin-bottom: 5px;"><strong>Performance:</strong> ${current.performance}</div>
                <div style="margin-bottom: 5px;"><strong>Compatibility:</strong> ${current.compatibility}</div>
                <div style="margin-bottom: 5px;"><strong>Security:</strong> ${current.security}</div>
                <div style="margin-top: 10px;"><strong>Features:</strong></div>
                <ul style="margin: 5px 0 0 20px; padding: 0;">
                    ${current.features.map(f => `<li>${f}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    /**
     * Update performance statistics
     */
    function updatePerformanceStats(backend) {
        const statsDiv = document.getElementById('crypto-backend-stats');
        if (!statsDiv) return;

        const stats = localStorage.getItem('cryptoBackendStats');
        if (stats) {
            try {
                const parsed = JSON.parse(stats);
                const currentStats = parsed[backend];

                if (currentStats) {
                    statsDiv.innerHTML = `
                        <strong>Performance Stats (${backend}):</strong><br>
                        <div style="margin-top: 5px;">
                            Last test: ${currentStats.throughput.toFixed(2)} MB/s<br>
                            Operations: ${currentStats.operations} completed<br>
                            Average: ${(currentStats.totalThroughput / currentStats.operations).toFixed(2)} MB/s
                        </div>
                    `;
                } else {
                    statsDiv.textContent = 'No performance data available. Run a test to see statistics.';
                }
            } catch (e) {
                console.error('Failed to parse stats:', e);
            }
        } else {
            statsDiv.textContent = 'No performance data available. Run a test to see statistics.';
        }
    }

    /**
     * Run performance test
     */
    async function runPerformanceTest() {
        const statsDiv = document.getElementById('crypto-backend-stats');
        const button = document.querySelector('.crypto-test-btn');

        try {
            button.disabled = true;
            button.textContent = 'Testing...';
            statsDiv.textContent = 'Running performance test...';
            statsDiv.style.background = '#fff3cd';

            const testSize = 10 * 1024 * 1024; // 10 MB
            const testData = new Uint8Array(testSize);
            crypto.getRandomValues(testData);

            const backend = await CryptoBackends.createBackend(CryptoBackends.getCurrentBackend());
            const key = new Uint8Array(16);
            const nonce = new Uint8Array(8);
            crypto.getRandomValues(key);
            crypto.getRandomValues(nonce);

            // Warm up
            await backend.encrypt(key, nonce, 0, testData.subarray(0, 1024 * 1024));

            // Test encryption
            const startTime = performance.now();
            const result = await backend.encrypt(key, nonce, 0, testData);
            const endTime = performance.now();

            const duration = (endTime - startTime) / 1000; // seconds
            const throughput = (testSize / (1024 * 1024)) / duration; // MB/s

            // Save stats
            const allStats = JSON.parse(localStorage.getItem('cryptoBackendStats') || '{}');
            const backendName = CryptoBackends.getCurrentBackend();

            if (!allStats[backendName]) {
                allStats[backendName] = {
                    operations: 0,
                    totalThroughput: 0
                };
            }

            allStats[backendName].operations++;
            allStats[backendName].totalThroughput += throughput;
            allStats[backendName].throughput = throughput;

            localStorage.setItem('cryptoBackendStats', JSON.stringify(allStats));

            // Display results
            statsDiv.innerHTML = `
                <strong>✓ Performance Test Complete!</strong><br>
                <div style="margin-top: 5px;">
                    Throughput: <strong>${throughput.toFixed(2)} MB/s</strong><br>
                    Test size: ${(testSize / (1024 * 1024)).toFixed(1)} MB<br>
                    Duration: ${duration.toFixed(3)}s<br>
                    Operations: ${allStats[backendName].operations}<br>
                    Average: ${(allStats[backendName].totalThroughput / allStats[backendName].operations).toFixed(2)} MB/s
                </div>
            `;
            statsDiv.style.background = '#d4edda';

            button.textContent = 'Run Performance Test';
            button.disabled = false;

        } catch (error) {
            console.error('Performance test failed:', error);
            statsDiv.textContent = `Test failed: ${error.message}`;
            statsDiv.style.background = '#f8d7da';
            button.textContent = 'Run Performance Test';
            button.disabled = false;
        }
    }

    // Export to global scope
    scope.CryptoBackendUI = {
        init: initCryptoBackendUI,
        switchBackend,
        runPerformanceTest
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initCryptoBackendUI, 1000);
        });
    } else {
        setTimeout(initCryptoBackendUI, 1000);
    }

})(typeof self !== 'undefined' ? self : window);
