export interface TagsResponse {
  list: TagsData[];
}

export interface TagsData {
  tagId: string;
  name: string;
  count: number;
  createdAt: number;
  updatedAt: number;
}
