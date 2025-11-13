use wasm_bindgen::prelude::*;
use aes::Aes128;
use ccm::aead::{Aead, KeyInit, Payload};
use ccm::{Ccm, consts::{U8, U16}};

// Configure panic hook for better error messages in the browser
#[cfg(feature = "console_error_panic_hook")]
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// AES-128-CCM with 8-byte nonce and 16-byte tag
type Aes128Ccm = Ccm<Aes128, U8, U16>;

/// AES-CCM Cipher for encryption/decryption
#[wasm_bindgen]
pub struct AesCcmCipher {
    cipher: Aes128Ccm,
}

#[wasm_bindgen]
impl AesCcmCipher {
    /// Create a new cipher instance with the given key
    ///
    /// # Arguments
    /// * `key` - 16-byte AES-128 key
    #[wasm_bindgen(constructor)]
    pub fn new(key: &[u8]) -> Result<AesCcmCipher, JsValue> {
        if key.len() != 16 {
            return Err(JsValue::from_str("Key must be exactly 16 bytes for AES-128"));
        }

        let cipher = Aes128Ccm::new_from_slice(key)
            .map_err(|e| JsValue::from_str(&format!("Failed to create cipher: {:?}", e)))?;

        Ok(AesCcmCipher { cipher })
    }

    /// Encrypt data with the given nonce and counter
    ///
    /// # Arguments
    /// * `nonce` - 8-byte nonce
    /// * `plaintext` - Data to encrypt
    /// * `counter` - 8-byte counter value
    ///
    /// # Returns
    /// Encrypted data with 16-byte authentication tag appended
    #[wasm_bindgen]
    pub fn encrypt(
        &self,
        nonce: &[u8],
        plaintext: &[u8],
        counter: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        if nonce.len() != 8 {
            return Err(JsValue::from_str("Nonce must be exactly 8 bytes"));
        }

        // Prepare nonce for CCM (8 bytes)
        let mut ccm_nonce = [0u8; 8];
        ccm_nonce.copy_from_slice(&nonce[0..8]);

        // Encrypt with optional associated data (counter as AAD)
        let payload = if counter.len() > 0 {
            Payload {
                msg: plaintext,
                aad: counter,
            }
        } else {
            Payload {
                msg: plaintext,
                aad: &[],
            }
        };

        let ciphertext = self
            .cipher
            .encrypt(&ccm_nonce.into(), payload)
            .map_err(|e| JsValue::from_str(&format!("Encryption failed: {:?}", e)))?;

        Ok(ciphertext)
    }

    /// Decrypt data with the given nonce and counter
    ///
    /// # Arguments
    /// * `nonce` - 8-byte nonce
    /// * `ciphertext` - Encrypted data with authentication tag
    /// * `counter` - 8-byte counter value
    ///
    /// # Returns
    /// Decrypted plaintext
    #[wasm_bindgen]
    pub fn decrypt(
        &self,
        nonce: &[u8],
        ciphertext: &[u8],
        counter: &[u8],
    ) -> Result<Vec<u8>, JsValue> {
        if nonce.len() != 8 {
            return Err(JsValue::from_str("Nonce must be exactly 8 bytes"));
        }

        // Prepare nonce for CCM (8 bytes)
        let mut ccm_nonce = [0u8; 8];
        ccm_nonce.copy_from_slice(&nonce[0..8]);

        // Decrypt with optional associated data (counter as AAD)
        let payload = if counter.len() > 0 {
            Payload {
                msg: ciphertext,
                aad: counter,
            }
        } else {
            Payload {
                msg: ciphertext,
                aad: &[],
            }
        };

        let plaintext = self
            .cipher
            .decrypt(&ccm_nonce.into(), payload)
            .map_err(|e| JsValue::from_str(&format!("Decryption failed: {:?}", e)))?;

        Ok(plaintext)
    }
}

/// Encrypt multiple chunks in batch for better performance
///
/// # Arguments
/// * `key` - 16-byte AES-128 key
/// * `nonce` - 8-byte nonce
/// * `chunks` - Array of data chunks to encrypt
/// * `start_counter` - Starting counter value
///
/// # Returns
/// Array of encrypted chunks
#[wasm_bindgen]
pub fn encrypt_chunks(
    key: &[u8],
    nonce: &[u8],
    chunks: Vec<Vec<u8>>,
    start_counter: u64,
) -> Result<Vec<Vec<u8>>, JsValue> {
    let cipher = AesCcmCipher::new(key)?;
    let mut results = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let counter = start_counter + (i as u64);
        let counter_bytes = counter.to_be_bytes();
        let encrypted = cipher.encrypt(nonce, chunk, &counter_bytes)?;
        results.push(encrypted);
    }

    Ok(results)
}

/// Decrypt multiple chunks in batch for better performance
///
/// # Arguments
/// * `key` - 16-byte AES-128 key
/// * `nonce` - 8-byte nonce
/// * `chunks` - Array of encrypted chunks
/// * `start_counter` - Starting counter value
///
/// # Returns
/// Array of decrypted chunks
#[wasm_bindgen]
pub fn decrypt_chunks(
    key: &[u8],
    nonce: &[u8],
    chunks: Vec<Vec<u8>>,
    start_counter: u64,
) -> Result<Vec<Vec<u8>>, JsValue> {
    let cipher = AesCcmCipher::new(key)?;
    let mut results = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let counter = start_counter + (i as u64);
        let counter_bytes = counter.to_be_bytes();
        let decrypted = cipher.decrypt(nonce, chunk, &counter_bytes)?;
        results.push(decrypted);
    }

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = [0u8; 16];
        let nonce = [1u8; 8];
        let plaintext = b"Hello, WASM world!";
        let counter = 0u64.to_be_bytes();

        let cipher = AesCcmCipher::new(&key).unwrap();
        let ciphertext = cipher.encrypt(&nonce, plaintext, &counter).unwrap();
        let decrypted = cipher.decrypt(&nonce, &ciphertext, &counter).unwrap();

        assert_eq!(plaintext, &decrypted[..]);
    }

    #[test]
    fn test_batch_operations() {
        let key = [0u8; 16];
        let nonce = [1u8; 8];
        let chunks = vec![
            b"chunk1".to_vec(),
            b"chunk2".to_vec(),
            b"chunk3".to_vec(),
        ];

        let encrypted = encrypt_chunks(&key, &nonce, chunks.clone(), 0).unwrap();
        let decrypted = decrypt_chunks(&key, &nonce, encrypted, 0).unwrap();

        for (original, dec) in chunks.iter().zip(decrypted.iter()) {
            assert_eq!(original, dec);
        }
    }
}
