export const OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR = Symbol(
  'OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR',
);

export interface OutboundEmailPayloadEncryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
