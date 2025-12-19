/**
 * Shared types for tdlib commands and context
 * Used by both nest_api and tdlib_worker
 */

// Command Types
export type TdlibCommandType =
  | 'sendMessage'
  | 'login'
  | 'getChats'
  | 'getChat'
  | 'getAuthorizationState'
  | 'logOut'
  | 'getMe'
  | 'getUserId'
  | 'resendAuthenticationCode'
  | 'provideAuthCode'
  | 'providePassword';

// Metadata Actions for different command types
export type GetChatsAction = 'listGroups';
export type GetChatAction = 'listGroups' | 'validateForActivation' | 'getTitleForActiveGroup';
export type GetUserIdAction = 'activateGroups' | 'deactivateGroups' | 'listActiveGroups';
export type GetMeAction = 'getUserInfoAfterLogin';
export type SendMessageAction = 'notifyOnSuccess';

// Base metadata interfaces
export interface BaseCommandMetadata {
  action?: string;
}

// GetChats metadata
export interface GetChatsListGroupsMetadata extends BaseCommandMetadata {
  action: 'listGroups';
  chatList: { _: string };
  limit: number;
}

export type GetChatsMetadata = GetChatsListGroupsMetadata;

// GetChat metadata
export interface GetChatListGroupsMetadata extends BaseCommandMetadata {
  action: 'listGroups';
  batchId: string;
  chatIdToFetch: number;
}

export interface GetChatValidateForActivationMetadata extends BaseCommandMetadata {
  action: 'validateForActivation';
  batchId: string;
  chatIdToFetch: number;
}

export interface GetChatGetTitleForActiveGroupMetadata extends BaseCommandMetadata {
  action: 'getTitleForActiveGroup';
  batchId: string;
  chatIdToFetch: number;
}

export type GetChatMetadata =
  | GetChatListGroupsMetadata
  | GetChatValidateForActivationMetadata
  | GetChatGetTitleForActiveGroupMetadata;

// GetUserId metadata
export interface GetUserIdActivateGroupsMetadata extends BaseCommandMetadata {
  action: 'activateGroups';
  groupIds: number[];
  invalidIds: string[];
}

export interface GetUserIdDeactivateGroupsMetadata extends BaseCommandMetadata {
  action: 'deactivateGroups';
  groupIds: number[];
}

export interface GetUserIdListActiveGroupsMetadata extends BaseCommandMetadata {
  action: 'listActiveGroups';
}

export interface GetUserIdCheckSelfMessageMetadata extends BaseCommandMetadata {
  action: 'checkSelfMessage';
  messageData: {
    messageId?: number;
    chatId: number;
    senderId?: number;
    date?: number;
    content?: unknown;
    update: unknown;
  };
}

export type GetUserIdMetadata =
  | GetUserIdActivateGroupsMetadata
  | GetUserIdDeactivateGroupsMetadata
  | GetUserIdListActiveGroupsMetadata
  | GetUserIdCheckSelfMessageMetadata;

// GetMe metadata
export interface GetMeGetUserInfoAfterLoginMetadata extends BaseCommandMetadata {
  action: 'getUserInfoAfterLogin';
}

export type GetMeMetadata = GetMeGetUserInfoAfterLoginMetadata;

// SendMessage metadata
export interface SendMessageNotifyOnSuccessMetadata extends BaseCommandMetadata {
  action: 'notifyOnSuccess';
}

export type SendMessageMetadata = SendMessageNotifyOnSuccessMetadata;

// Batch state metadata (for aggregation) - used internally in response handler
// This extends command metadata with batch tracking fields
export interface BatchStateMetadata {
  batchId: string;
  telegramUserId?: number;
  validatedGroups?: Array<{ id: number; title: string }>;
  notFoundIds?: number[];
  invalidGroupIds?: number[];
  grupos?: Array<{ id: number; title: string }>;
  groups?: Array<{ id: number; title: string }>;
  activeGroupIds?: number[];
  pendingChats?: number;
  chatIds?: number[];
  // Allow extending with command-specific metadata
  [key: string]: unknown;
}

// Helper type to extract metadata type from command context
export type CommandContextMetadata<T extends CommandContext> = T extends { metadata?: infer M } ? M : never;

// Command Context - discriminated union based on command type
export interface BaseCommandContext {
  userId: string; // Bot user ID (string) - identifies which bot user owns this worker
  chatId?: number;
}

export interface GetChatsCommandContext extends BaseCommandContext {
  commandType: 'getChats';
  metadata?: GetChatsMetadata;
}

export interface GetChatCommandContext extends BaseCommandContext {
  commandType: 'getChat';
  metadata?: GetChatMetadata;
}

export interface GetUserIdCommandContext extends BaseCommandContext {
  commandType: 'getUserId';
  metadata?: GetUserIdMetadata;
}

export interface GetMeCommandContext extends BaseCommandContext {
  commandType: 'getMe';
  metadata?: GetMeMetadata;
}

export interface SendMessageCommandContext extends BaseCommandContext {
  commandType: 'sendMessage';
  metadata?: SendMessageMetadata;
}

export interface LogOutCommandContext extends BaseCommandContext {
  commandType: 'logOut';
  metadata?: never;
}

export interface GetAuthorizationStateCommandContext extends BaseCommandContext {
  commandType: 'getAuthorizationState';
  metadata?: never;
}

export interface ResendAuthenticationCodeCommandContext extends BaseCommandContext {
  commandType: 'resendAuthenticationCode';
  metadata?: never;
}

export interface LoginCommandContext extends BaseCommandContext {
  commandType: 'login';
  metadata?: never;
}

export interface ProvideAuthCodeCommandContext extends BaseCommandContext {
  commandType: 'provideAuthCode';
  metadata?: never;
}

export interface ProvidePasswordCommandContext extends BaseCommandContext {
  commandType: 'providePassword';
  metadata?: never;
}

export type CommandContext =
  | GetChatsCommandContext
  | GetChatCommandContext
  | GetUserIdCommandContext
  | GetMeCommandContext
  | SendMessageCommandContext
  | LogOutCommandContext
  | GetAuthorizationStateCommandContext
  | ResendAuthenticationCodeCommandContext
  | LoginCommandContext
  | ProvideAuthCodeCommandContext
  | ProvidePasswordCommandContext;

// TdlibCommand interface
export interface TdlibCommand {
  type: TdlibCommandType;
  payload: unknown;
  requestId?: string;
  context?: CommandContext; // Context to be echoed back in response
}
