export interface Member {
  userId: string;
  name: string;
  iconHash: string;
}

export interface MemberListResponse {
  list: Member[];
  next?: string;
}
