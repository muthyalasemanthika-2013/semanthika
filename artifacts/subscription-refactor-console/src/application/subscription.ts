export type ScenarioKey =
  | 'success'
  | 'missing-parameters'
  | 'unknown-user'
  | 'suspended-user'
  | 'unknown-plan'
  | 'payment-failed'
  | 'payment-pending';

export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type User = {
  id: string;
  email: string;
  status: UserStatus;
};

export type Plan = {
  id: string;
  name: string;
  priceInCents: number;
};

export type Charge = {
  id: string;
  status: 'succeeded' | 'failed' | 'pending';
  failureMessage?: string;
};

export type ProcessSubscriptionCommand = {
  userId?: string;
  planId?: string;
  paymentToken?: string;
};

export type HttpOutcome = {
  status: number;
  body: Record<string, string | boolean>;
};

export type TraceStep = {
  id: string;
  label: string;
  detail: string;
  layer: 'delivery' | 'application' | 'domain' | 'adapter';
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
};

export type ProcessSubscriptionResult = {
  outcome: HttpOutcome;
  trace: TraceStep[];
};

export interface UserRepository {
  findById(userId: string): Promise<User | null>;
}

export interface PlanRepository {
  findById(planId: string): Promise<Plan | null>;
}

export interface PaymentGateway {
  charge(input: {
    amountInCents: number;
    email: string;
    paymentToken: string;
  }): Promise<Charge>;
}

export interface AccountRepository {
  activate(userId: string, planId: string): Promise<void>;
}

export interface TransactionRepository {
  record(input: {
    userId: string;
    amountInCents: number;
    paymentId: string;
  }): Promise<void>;
}

export interface NotificationService {
  sendSubscriptionUpgraded(input: {
    email: string;
    planName: string;
  }): Promise<void>;
}

export type SubscriptionPorts = {
  users: UserRepository;
  plans: PlanRepository;
  payments: PaymentGateway;
  accounts: AccountRepository;
  transactions: TransactionRepository;
  notifications: NotificationService;
};

type TraceWriter = (
  step: Omit<TraceStep, 'id'>,
) => void;

export async function processSubscription(
  command: ProcessSubscriptionCommand,
  ports: SubscriptionPorts,
  writeTrace: TraceWriter,
): Promise<ProcessSubscriptionResult> {
  const trace: TraceStep[] = [];
  const appendTrace = (step: Omit<TraceStep, 'id'>) => {
    const nextStep = { ...step, id: `step_${trace.length + 1}` };
    trace.push(nextStep);
    writeTrace(nextStep);
  };
  const requiredFields = [
    ['userId', command.userId],
    ['planId', command.planId],
    ['paymentToken', command.paymentToken],
  ] as const;

  const missingField = requiredFields.find(([, value]) => !value)?.[0];
  if (missingField) {
    appendTrace({
      label: 'Validate command',
      detail: `Missing required field: ${missingField}`,
      layer: 'delivery',
      status: 'failed',
      durationMs: 2,
    });
    return {
      trace,
      outcome: { status: 400, body: { error: 'Missing parameters' } },
    };
  }

  const userId = command.userId as string;
  const planId = command.planId as string;
  const paymentToken = command.paymentToken as string;

  appendTrace({
    label: 'Validate command',
    detail: 'Request shape accepted at the delivery boundary',
    layer: 'delivery',
    status: 'completed',
    durationMs: 2,
  });

  const user = await ports.users.findById(userId);
  if (!user) {
    appendTrace({
      label: 'Load user',
      detail: 'UserRepository returned no matching account',
      layer: 'adapter',
      status: 'failed',
      durationMs: 8,
    });
    return {
      trace,
      outcome: { status: 404, body: { error: 'User not found' } },
    };
  }

  appendTrace({
    label: 'Load user',
    detail: `${user.email} · status ${user.status}`,
    layer: 'adapter',
    status: 'completed',
    durationMs: 8,
  });

  if (user.status === 'SUSPENDED') {
    appendTrace({
      label: 'Check account policy',
      detail: 'Suspended accounts cannot start a subscription',
      layer: 'domain',
      status: 'failed',
      durationMs: 1,
    });
    return {
      trace,
      outcome: {
        status: 403,
        body: { error: 'User account is suspended' },
      },
    };
  }

  const plan = await ports.plans.findById(planId);
  if (!plan) {
    appendTrace({
      label: 'Load plan',
      detail: 'PlanRepository returned no matching plan',
      layer: 'adapter',
      status: 'failed',
      durationMs: 7,
    });
    return {
      trace,
      outcome: { status: 404, body: { error: 'Plan not found' } },
    };
  }

  appendTrace({
    label: 'Load plan',
    detail: `${plan.name} · ${formatCurrency(plan.priceInCents)}/month`,
    layer: 'adapter',
    status: 'completed',
    durationMs: 7,
  });

  const charge = await ports.payments.charge({
    amountInCents: plan.priceInCents,
    email: user.email,
    paymentToken,
  });

  if (charge.status === 'failed') {
    appendTrace({
      label: 'Authorize payment',
      detail: charge.failureMessage ?? 'Gateway declined the payment',
      layer: 'adapter',
      status: 'failed',
      durationMs: 214,
    });
    return {
      trace,
      outcome: {
        status: 402,
        body: {
          error: `Payment failed: ${charge.failureMessage ?? 'Card declined'}`,
        },
      },
    };
  }

  if (charge.status !== 'succeeded') {
    appendTrace({
      label: 'Authorize payment',
      detail: 'Gateway returned a non-final status',
      layer: 'adapter',
      status: 'failed',
      durationMs: 214,
    });
    return {
      trace,
      outcome: { status: 400, body: { error: 'Payment was not successful' } },
    };
  }

  appendTrace({
    label: 'Authorize payment',
    detail: `Charge ${charge.id} captured by PaymentGateway`,
    layer: 'adapter',
    status: 'completed',
    durationMs: 214,
  });

  await ports.accounts.activate(user.id, plan.id);
  appendTrace({
    label: 'Activate account',
    detail: 'AccountRepository committed ACTIVE status and plan',
    layer: 'adapter',
    status: 'completed',
    durationMs: 12,
  });

  await ports.transactions.record({
    userId: user.id,
    amountInCents: plan.priceInCents,
    paymentId: charge.id,
  });
  appendTrace({
    label: 'Record transaction',
    detail: 'TransactionRepository wrote the payment record',
    layer: 'adapter',
    status: 'completed',
    durationMs: 10,
  });

  await ports.notifications.sendSubscriptionUpgraded({
    email: user.email,
    planName: plan.name,
  });
  appendTrace({
    label: 'Notify customer',
    detail: `NotificationService sent upgrade email to ${user.email}`,
    layer: 'adapter',
    status: 'completed',
    durationMs: 38,
  });

  return {
    trace,
    outcome: {
      status: 200,
      body: { success: true, transactionId: charge.id },
    },
  };
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}