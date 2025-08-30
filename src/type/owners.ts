export interface OwnersResponse {
  list: OwnersList[];
}

export interface OwnersList {
  bizId: string;
  name: string;
  linePictureUri?: string;
}
