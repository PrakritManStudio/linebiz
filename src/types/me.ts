/** The signed-in LINE Business ID user. */
export interface Me {
  bizId: string;
  language: string;
  name: string;
  linePictureUri: string;
  localStorageEncryptionKey: string;
}
