export const EMAIL_TOKEN_ENCRYPTOR = Symbol(
  'EMAIL_TOKEN_ENCRYPTOR',
);

export interface EmailTokenEncryptor {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
