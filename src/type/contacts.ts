interface UserProfile {
  userId: string;
  name: string;
  friend: boolean;
  lastActivityExpiresAt: number;
  iconHash: string;
}

interface GroupProfile {
  groupId: string;
  name: string;
  count: number;
  iconHash: string;
}

export interface Contact {
  contactId: string;
  profile: UserProfile | GroupProfile;
  tagIds: string[];
  autoTagIds: string[];
  done: boolean;
  followedUp: boolean;
  spam: boolean;
  friend?: boolean;
  useManualChat: boolean;
  chatAvailable: boolean;
  lastTalkedAt: number;
  chatExists: boolean;
}

export type ContactResponse = {
  list: Contact[];
  next?: string;
};
