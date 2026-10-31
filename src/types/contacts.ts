/** Profile of a user contact. */
export interface ContactUserProfile {
  userId: string;
  name: string;
  friend: boolean;
  lastActivityExpiresAt: number;
  iconHash: string;
}

/** Profile of a group contact. */
export interface ContactGroupProfile {
  groupId: string;
  name: string;
  count: number;
  iconHash: string;
}

/** A contact (user or group) of the bot. */
export interface Contact {
  contactId: string;
  profile: ContactUserProfile | ContactGroupProfile;
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
