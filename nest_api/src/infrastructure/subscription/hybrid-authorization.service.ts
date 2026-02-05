import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@/config/app.config';
import { PhoneWhitelistService } from '@/infrastructure/telegram/phone-whitelist.service';
import { SubscriptionAuthorizationService } from './subscription-authorization.service';

/**
 * Service for hybrid authorization combining whitelist and subscription checks
 * Behavior depends on AUTHORIZATION_MODE config:
 * - 'whitelist': Only check phone whitelist
 * - 'subscription': Only check subscription status
 * - 'hybrid': Check whitelist first, then subscription
 */
@Injectable()
export class HybridAuthorizationService {
  private readonly logger = new Logger(HybridAuthorizationService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly phoneWhitelistService: PhoneWhitelistService,
    private readonly subscriptionAuthorizationService: SubscriptionAuthorizationService,
  ) {}

  /**
   * Check if a user is authorized based on configured mode
   * @param userId - The user ID (for subscription check)
   * @param phoneNumber - The phone number (for whitelist check)
   */
  async isAuthorized(userId: string, phoneNumber?: string): Promise<boolean> {
    const mode = this.appConfig.getAuthorizationMode();

    switch (mode) {
      case 'whitelist':
        return this.checkWhitelist(phoneNumber);

      case 'subscription':
        return this.subscriptionAuthorizationService.isAuthorized(userId);

      case 'hybrid':
        // Check whitelist first (faster)
        if (phoneNumber && this.checkWhitelist(phoneNumber)) {
          return true;
        }
        // Fall back to subscription check
        return this.subscriptionAuthorizationService.isAuthorized(userId);

      default:
        this.logger.warn(`Unknown authorization mode: ${mode}, defaulting to whitelist`);
        return this.checkWhitelist(phoneNumber);
    }
  }

  /**
   * Check if a phone number is in the whitelist
   */
  private checkWhitelist(phoneNumber?: string): boolean {
    if (!phoneNumber) {
      return false;
    }
    return this.phoneWhitelistService.isAllowed(phoneNumber);
  }

  /**
   * Get detailed authorization info
   */
  async getAuthorizationInfo(userId: string, phoneNumber?: string): Promise<{
    authorized: boolean;
    mode: 'whitelist' | 'subscription' | 'hybrid';
    whitelistAuthorized: boolean;
    subscriptionAuthorized: boolean;
    reason?: string;
  }> {
    const mode = this.appConfig.getAuthorizationMode();
    const whitelistAuthorized = this.checkWhitelist(phoneNumber);
    const subscriptionInfo = await this.subscriptionAuthorizationService.getAuthorizationInfo(userId);

    let authorized: boolean;
    let reason: string | undefined;

    switch (mode) {
      case 'whitelist':
        authorized = whitelistAuthorized;
        reason = whitelistAuthorized ? undefined : 'phone_not_whitelisted';
        break;

      case 'subscription':
        authorized = subscriptionInfo.authorized;
        reason = subscriptionInfo.reason;
        break;

      case 'hybrid':
        authorized = whitelistAuthorized || subscriptionInfo.authorized;
        if (!authorized) {
          reason = 'not_whitelisted_and_no_subscription';
        }
        break;

      default:
        authorized = whitelistAuthorized;
        reason = whitelistAuthorized ? undefined : 'phone_not_whitelisted';
    }

    return {
      authorized,
      mode,
      whitelistAuthorized,
      subscriptionAuthorized: subscriptionInfo.authorized,
      reason,
    };
  }

  /**
   * Get the current authorization mode
   */
  getAuthorizationMode(): 'whitelist' | 'subscription' | 'hybrid' {
    return this.appConfig.getAuthorizationMode();
  }
}
