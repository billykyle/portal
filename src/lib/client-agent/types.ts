export type OauthAuthMethod = "none" | "client_secret_basic" | "client_secret_post";

export type OauthClientRow = {
  id: string;
  secretHash: string | null;
  name: string;
  redirectUris: string[];
  authMethod: OauthAuthMethod;
  createdAt: Date;
};

export type AuthCodeRow = {
  codeHash: string;
  oauthClientId: string;
  userId: string;
  portalClientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
  expiresAt: Date;
};

export type TokenRow = {
  id: string;
  oauthClientId: string;
  userId: string;
  portalClientId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  scope: string;
  resource: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type AccessView = TokenRow & {
  email: string;
  inviteCode: string;
  agentAccess: boolean;
  member: boolean;
};

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  state: string | null;
  scope: string;
  resource: string;
};

export interface ClientConnectorStore {
  insertOauthClient(row: OauthClientRow): Promise<void>;
  getOauthClient(id: string): Promise<OauthClientRow | null>;
  insertAuthCode(row: AuthCodeRow): Promise<void>;
  consumeAuthCode(codeHash: string, now: Date): Promise<AuthCodeRow | null>;
  insertToken(row: TokenRow): Promise<void>;
  findByAccessHash(hash: string): Promise<AccessView | null>;
  findByRefreshHash(hash: string): Promise<TokenRow | null>;
  findByPreviousRefreshHash(hash: string): Promise<TokenRow | null>;
  rotateToken(
    id: string,
    expectedRefreshHash: string,
    next: {
      accessTokenHash: string;
      refreshTokenHash: string;
      previousRefreshTokenHash: string;
      accessExpiresAt: Date;
      refreshExpiresAt: Date;
      now: Date;
    },
  ): Promise<boolean>;
  revokeToken(id: string, now: Date): Promise<void>;
  revokePortalTokens(portalClientId: string, now: Date): Promise<void>;
  touchToken(id: string, now: Date): Promise<void>;
  agentAccessEnabled(portalClientId: string): Promise<boolean>;
  userCanActAs(userId: string, portalClientId: string): Promise<boolean>;
}
