import {
  type NotificationService,
  type Plan,
  type PlanRepository,
  type PaymentGateway,
  type SubscriptionPorts,
  type TransactionRepository,
  type User,
  type UserRepository,
  type AccountRepository,
  type ScenarioKey,
} from '@/application/subscription';

const demoUser: User = {
  id: 'usr_0142',
  email: 'maya.chen@northstar.dev',
  status: 'ACTIVE',
};

const suspendedUser: User = {
  id: 'usr_suspended',
  email: 'sam.rivera@northstar.dev',
  status: 'SUSPENDED',
};

const demoPlan: Plan = {
  id: 'plan_pro',
  name: 'Pro workspace',
  priceInCents: 4900,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDemoPorts(scenario: ScenarioKey): SubscriptionPorts {
  const users: UserRepository = {
    async findById(userId) {
      await wait(8);
      if (scenario === 'unknown-user') return null;
      if (scenario === 'suspended-user') return suspendedUser;
      return userId === demoUser.id ? demoUser : null;
    },
  };

  const plans: PlanRepository = {
    async findById(planId) {
      await wait(7);
      if (scenario === 'unknown-plan') return null;
      return planId === demoPlan.id ? demoPlan : null;
    },
  };

  const payments: PaymentGateway = {
    async charge() {
      await wait(214);
      if (scenario === 'payment-failed') {
        return {
          id: 'ch_declined_8F2',
          status: 'failed',
          failureMessage: 'Your card was declined',
        };
      }
      if (scenario === 'payment-pending') {
        return { id: 'ch_pending_8F2', status: 'pending' };
      }
      return { id: 'ch_3N7A2KP9', status: 'succeeded' };
    },
  };

  const accounts: AccountRepository = {
    async activate() {
      await wait(12);
    },
  };

  const transactions: TransactionRepository = {
    async record() {
      await wait(10);
    },
  };

  const notifications: NotificationService = {
    async sendSubscriptionUpgraded() {
      await wait(38);
    },
  };

  return { users, plans, payments, accounts, transactions, notifications };
}