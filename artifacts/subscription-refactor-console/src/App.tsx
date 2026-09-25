import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock3,
  Command,
  Database,
  FileCode2,
  GitBranch,
  Layers3,
  Play,
  RefreshCcw,
  Route,
  Server,
  ShieldCheck,
  Terminal,
  Timer,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route as WouterRoute, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  processSubscription,
  type ProcessSubscriptionResult,
  type ScenarioKey,
} from '@/application/subscription';
import { createDemoPorts } from '@/infrastructure/demo-adapters';

const queryClient = new QueryClient();

type ScenarioId = ScenarioKey;
type StepStatus = 'idle' | 'running' | 'complete' | 'failed';

type Scenario = {
  id: ScenarioId;
  eyebrow: string;
  title: string;
  description: string;
  customer: string;
  plan: string;
  amount: string;
  accent: string;
  expected: string;
};

type TraceStep = {
  id: string;
  label: string;
  layer: 'adapter' | 'application' | 'domain';
  detail: string;
  metric: string;
  status: StepStatus;
  icon: typeof Route;
};

const scenarios: Scenario[] = [
  {
    id: 'success',
    eyebrow: 'HAPPY PATH',
    title: 'Activate Pro workspace',
    description: 'A clean attempt that crosses every port in the refactored boundary.',
    customer: 'usr_0142',
    plan: 'plan_pro',
    amount: '$49.00 / month',
    accent: 'lime',
    expected: '200 OK',
  },
  {
    id: 'suspended-user',
    eyebrow: 'DOMAIN GUARD',
    title: 'Suspended account',
    description: 'The domain policy blocks the request before any payment side effect.',
    customer: 'usr_suspended',
    plan: 'plan_pro',
    amount: '$49.00 / month',
    accent: 'amber',
    expected: '403 Forbidden',
  },
  {
    id: 'payment-failed',
    eyebrow: 'ADAPTER FAULT',
    title: 'Declined payment',
    description: 'The gateway returns a payment failure without leaking adapter details.',
    customer: 'usr_0142',
    plan: 'plan_pro',
    amount: '$49.00 / month',
    accent: 'coral',
    expected: '402 Payment Required',
  },
];

function StatusDot({ tone = 'lime' }: { tone?: 'lime' | 'cyan' | 'amber' | 'coral' | 'muted' }) {
  const tones = {
    lime: 'bg-[#c9f36a]',
    cyan: 'bg-[#55d7cf]',
    amber: 'bg-[#ffc46b]',
    coral: 'bg-[#ff8276]',
    muted: 'bg-[#617082]',
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${tones[tone]}`} aria-hidden="true" />;
}

function LayerBadge({ layer }: { layer: TraceStep['layer'] }) {
  const map = {
    adapter: { label: 'adapter', className: 'border-[#355a62] bg-[#153337] text-[#7eddd5]' },
    application: { label: 'application', className: 'border-[#4c5a35] bg-[#29351d] text-[#c9f36a]' },
    domain: { label: 'domain', className: 'border-[#5d4b35] bg-[#382e1d] text-[#ffc46b]' },
    delivery: { label: 'delivery', className: 'border-[#3f5264] bg-[#182733] text-[#9fb8ca]' },
  };
  const item = map[layer];
  return (
    <span className={`mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${item.className}`}>
      {item.label}
    </span>
  );
}

function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  selected: boolean;
  onSelect: () => void;
}) {
  const accent = scenario.accent === 'lime'
    ? 'border-[#c9f36a] bg-[#c9f36a]/[0.07]'
    : scenario.accent === 'amber'
      ? 'border-[#ffc46b]/70 bg-[#ffc46b]/[0.05]'
      : 'border-[#ff8276]/70 bg-[#ff8276]/[0.05]';
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={`button-scenario-${scenario.id}`}
      className={`group relative min-h-[146px] overflow-hidden rounded-xl border p-4 text-left transition-all duration-200 ${
        selected ? `${accent} quiet-glow` : 'border-[#263441] bg-[#101a25] hover:border-[#506071] hover:bg-[#13202c]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] font-medium tracking-[0.16em] text-[#738294]">{scenario.eyebrow}</span>
        {selected ? <CircleCheck className="h-4 w-4 text-[#c9f36a]" /> : <ChevronRight className="h-4 w-4 text-[#526172] transition-transform group-hover:translate-x-0.5" />}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.02em] text-[#e7edf1]">{scenario.title}</h3>
      <p className="mt-1.5 max-w-[240px] text-xs leading-5 text-[#83909d]">{scenario.description}</p>
      <span className="mono absolute bottom-4 right-4 text-[10px] text-[#9facb7]">{scenario.expected}</span>
    </button>
  );
}

function TraceStepRow({ step, index, active }: { step: TraceStep; index: number; active: boolean }) {
  const Icon = step.icon;
  const statusStyle = step.status === 'complete'
    ? 'border-[#50652e] bg-[#182619] text-[#c9f36a]'
    : step.status === 'failed'
      ? 'border-[#743d3b] bg-[#321d1e] text-[#ff8276]'
      : step.status === 'running'
        ? 'border-[#2e6467] bg-[#173138] text-[#7eddd5]'
        : 'border-[#2b3946] bg-[#131e29] text-[#687787]';
  return (
    <div
      data-testid={`trace-step-${step.id}`}
      className={`relative flex gap-3 rounded-lg px-3 py-3 transition-colors ${active ? 'bg-[#18252f]' : ''}`}
    >
      {index < 6 && <span className={`absolute left-[21px] top-[37px] h-[calc(100%+7px)] w-px ${step.status === 'complete' ? 'bg-[#576e38]' : 'bg-[#2b3946]'}`} />}
      <span className={`relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${statusStyle}`}>
        {step.status === 'complete' ? <Check className="h-3 w-3" strokeWidth={3} /> : step.status === 'failed' ? <X className="h-3 w-3" strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full ${step.status === 'running' ? 'pulse-dot bg-[#7eddd5]' : 'bg-[#536272]'}`} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[13px] font-medium ${step.status === 'idle' ? 'text-[#778593]' : 'text-[#dbe4e8]'}`}>{step.label}</span>
          <LayerBadge layer={step.layer} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="mono truncate text-[11px] text-[#697887]">{step.detail}</span>
          <span className="mono shrink-0 text-[10px] text-[#778593]">{step.metric}</span>
        </div>
      </div>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${step.status === 'complete' ? 'text-[#86a550]' : step.status === 'failed' ? 'text-[#d86c63]' : 'text-[#536272]'}`} />
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const navItems = [
    { label: 'Scenario runner', icon: Play, active: true },
    { label: 'Lifecycle trace', icon: Activity, active: false },
    { label: 'Architecture layers', icon: Layers3, active: false },
  ];
  return (
    <div className="min-h-[100dvh] bg-[#0c141e] text-[#e7edf1]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[238px] flex-col border-r border-[#202d3a] bg-[#0a121b] lg:flex">
        <div className="flex h-[76px] items-center border-b border-[#202d3a] px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#c9f36a] text-[#0c141e]">
              <Command className="h-4 w-4" strokeWidth={2.6} />
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-[-0.03em] text-[#e9f0f2]">Refactor Console</div>
              <div className="mono mt-0.5 text-[9px] uppercase tracking-[0.15em] text-[#748394]">subscription / v2</div>
            </div>
          </div>
        </div>
        <div className="px-3 pt-7">
          <div className="mono mb-3 px-3 text-[9px] uppercase tracking-[0.18em] text-[#596a7a]">Workspace</div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!item.active}
                  data-testid={`button-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[12px] transition-colors ${item.active ? 'bg-[#18252c] text-[#dce8dd]' : 'cursor-default text-[#536272]'}`}
                >
                  <Icon className={`h-4 w-4 ${item.active ? 'text-[#c9f36a]' : 'text-[#536272]'}`} />
                  <span>{item.label}</span>
                  {item.active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c9f36a]" />}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto border-t border-[#202d3a] p-5">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-[0.15em] text-[#637384]">Local demo</span>
            <StatusDot tone="lime" />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#687887]">No network calls. The application service seam is ready for integration.</p>
          <div className="mono mt-4 flex items-center gap-1.5 text-[10px] text-[#81909e]"><GitBranch className="h-3 w-3 text-[#55d7cf]" /> refactor/subscriptions</div>
        </div>
      </aside>
      <main className="min-h-[100dvh] lg:pl-[238px]">{children}</main>
    </div>
  );
}

function Home() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('success');
  const [isRunning, setIsRunning] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState<TraceStep[]>([]);
  const [runResult, setRunResult] = useState<ProcessSubscriptionResult | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [showPayload, setShowPayload] = useState(false);

  const selectedScenario = useMemo(() => scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0], [scenarioId]);

  useEffect(() => {
    if (!runResult || visibleSteps.length >= runResult.trace.length) return;
    const timer = window.setTimeout(() => {
      const nextDomainStep = runResult.trace[visibleSteps.length];
      const icons = [Terminal, Braces, Workflow, ShieldCheck, Zap, Database, Server];
      const nextStep: TraceStep = {
        ...nextDomainStep,
        layer: nextDomainStep.layer === 'delivery' ? 'adapter' : nextDomainStep.layer,
        metric: `${nextDomainStep.durationMs} ms`,
        icon: icons[visibleSteps.length] ?? Server,
        status: nextDomainStep.status === 'failed' ? 'failed' : 'complete',
      };
      setVisibleSteps((steps) => [...steps, nextStep]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [runResult, visibleSteps.length]);

  const submitAttempt = async () => {
    setHasRun(true);
    setVisibleSteps([]);
    setRunResult(null);
    setIsRunning(true);
    setShowPayload(false);
    const result = await processSubscription(
      {
        userId: selectedScenario.customer,
        planId: selectedScenario.plan,
        paymentToken: 'tok_demo_visa',
      },
      createDemoPorts(selectedScenario.id),
      () => undefined,
    );
    setRunResult(result);
    setIsRunning(false);
  };

  const resetAttempt = () => {
    setHasRun(false);
    setVisibleSteps([]);
    setRunResult(null);
    setIsRunning(false);
    setShowPayload(false);
  };

  const isFinished = Boolean(runResult && !isRunning && visibleSteps.length >= runResult.trace.length);
  const visibleResult = isFinished ? runResult : null;
  const visibleOutcome = visibleResult?.outcome;
  const outcomeLabel = visibleOutcome?.status === 200
    ? 'OK'
    : visibleOutcome?.status === 403
      ? 'Forbidden'
      : visibleOutcome?.status === 402
        ? 'Payment Required'
        : '';
  const outcomeMessage = visibleOutcome && typeof visibleOutcome.body.error === 'string'
    ? visibleOutcome.body.error
    : 'Account activated and transaction recorded.';
  const outcomeEvent = visibleOutcome && typeof visibleOutcome.body.transactionId === 'string'
    ? `subscription.upgraded · ${visibleOutcome.body.transactionId}`
    : visibleOutcome?.status === 403
      ? 'domain.account_suspended'
      : 'adapter.payment_declined';

  return (
    <AppShell>
      <header className="flex min-h-[76px] items-center justify-between border-b border-[#202d3a] px-5 py-4 sm:px-8 lg:px-10">
        <div>
          <div className="mono flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#657687]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c9f36a]" /> Billing platform / request lab
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#e9f0f2]">Subscription Refactor Console</h1>
        </div>
        <div className="hidden items-center gap-5 sm:flex">
          <div className="text-right">
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[#657687]">Environment</div>
            <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-[#b5c3cb]"><StatusDot tone="cyan" /> local / in-memory</div>
          </div>
          <div className="h-8 w-px bg-[#253341]" />
          <div className="text-right">
            <div className="mono text-[9px] uppercase tracking-[0.16em] text-[#657687]">Contract</div>
            <div className="mono mt-1 text-xs text-[#b5c3cb]">POST /v1/subscriptions</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1430px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <section className="animate-in grid grid-cols-1 gap-6 border-b border-[#202d3a] pb-8 xl:grid-cols-[1fr_390px] xl:gap-12">
          <div>
            <div className="flex items-center gap-2">
              <span className="mono rounded border border-[#355a62] bg-[#153337] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#7eddd5]">Request lab</span>
              <span className="mono text-[10px] text-[#617182]">01 / 03</span>
            </div>
            <h2 className="mt-5 max-w-[710px] text-3xl font-semibold leading-[1.08] tracking-[-0.055em] text-[#eef3f4] sm:text-4xl lg:text-[46px]">
              Trace one payment request through the <span className="text-[#c9f36a]">new boundary.</span>
            </h2>
            <p className="mt-4 max-w-[620px] text-sm leading-6 text-[#8a99a6]">
              Choose a controlled scenario, then watch the subscription handler move from transport to domain and back again. No legacy archaeology required.
            </p>
          </div>
          <div className="grid-scan rounded-xl border border-[#253442] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] uppercase tracking-[0.17em] text-[#657687]">Refactor signal</span>
              <Activity className="h-4 w-4 text-[#55d7cf]" />
            </div>
            <div className="mt-5 flex items-end justify-between">
              <div>
                <div className="mono text-3xl font-medium tracking-[-0.06em] text-[#dce8dd]">3</div>
                <div className="mt-1 text-[11px] text-[#778795]">layers with explicit seams</div>
              </div>
              <div className="text-right">
                <div className="mono text-3xl font-medium tracking-[-0.06em] text-[#dce8dd]">7</div>
                <div className="mt-1 text-[11px] text-[#778795]">observable checkpoints</div>
              </div>
            </div>
            <div className="mt-5 flex h-1 gap-1">
              <span className="flex-1 rounded-full bg-[#c9f36a]" /><span className="flex-1 rounded-full bg-[#55d7cf]" /><span className="flex-1 rounded-full bg-[#ffc46b]" />
            </div>
          </div>
        </section>

        <section className="animate-in animate-in-delay-1 pt-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.17em] text-[#657687]">Select a scenario</div>
              <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#e2eaed]">What should this request reveal?</h3>
            </div>
            <span className="mono text-[10px] text-[#627282]">Demo data / deterministic outcome</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} selected={scenario.id === scenarioId} onSelect={() => { setScenarioId(scenario.id); resetAttempt(); }} />
            ))}
          </div>
        </section>

        <section className="animate-in animate-in-delay-2 mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,.75fr)]">
          <div className="overflow-hidden rounded-xl border border-[#263543] bg-[#101a25]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263543] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="grid h-7 w-7 place-items-center rounded-md bg-[#1d3033] text-[#7eddd5]"><Route className="h-3.5 w-3.5" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-[#e5ecee]">Request lifecycle</h3>
                  <p className="mono mt-0.5 text-[10px] text-[#657687]">application service trace</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasRun && <span className="mono flex items-center gap-1.5 text-[10px] text-[#82919d]"><Timer className="h-3 w-3" /> {isRunning ? 'streaming' : `${visibleSteps.reduce((total, step) => total + Number.parseFloat(step.metric), 0).toFixed(1)} ms total`}</span>}
                <button type="button" onClick={resetAttempt} data-testid="button-reset-trace" className="rounded-md border border-[#2b3946] p-1.5 text-[#6f7f8d] transition-colors hover:border-[#566674] hover:text-[#d2dee1]" aria-label="Reset trace"><RefreshCcw className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="p-3 sm:p-4">
              {!hasRun ? (
                <div className="grid min-h-[430px] place-items-center rounded-lg border border-dashed border-[#2a3946] bg-[#0d1721] px-8 text-center">
                  <div>
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[#334555] bg-[#16232f] text-[#708291]"><GitBranch className="h-5 w-5" /></div>
                    <h4 className="mt-4 text-sm font-medium text-[#c3d0d6]">The trace is waiting for a request</h4>
                    <p className="mx-auto mt-2 max-w-[300px] text-xs leading-5 text-[#6f7f8c]">Submit the selected scenario to populate each checkpoint in sequence.</p>
                    <button type="button" onClick={submitAttempt} data-testid="button-submit-attempt-empty" className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#c9f36a] px-4 py-2.5 text-xs font-bold text-[#101710] transition-transform hover:-translate-y-0.5 active:translate-y-0"><Play className="h-3.5 w-3.5 fill-current" /> Submit attempt</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                   {visibleSteps.map((step, index) => <TraceStepRow key={step.id} step={step} index={index} active={step.status === 'running' || step.status === 'failed'} />)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-[#263543] bg-[#101a25]">
              <div className="flex items-center justify-between border-b border-[#263543] px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#e5ecee]">Run the scenario</h3>
                  <p className="mono mt-0.5 text-[10px] text-[#657687]">input snapshot</p>
                </div>
                <span className="mono rounded border border-[#354555] px-2 py-1 text-[10px] text-[#83909d]">{selectedScenario.id}</span>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="flex items-center justify-between border-b border-[#202e3b] pb-3"><span className="text-xs text-[#738290]">customer_id</span><span className="mono text-[11px] text-[#c7d2d7]">{selectedScenario.customer}</span></div>
                <div className="flex items-center justify-between border-b border-[#202e3b] pb-3"><span className="text-xs text-[#738290]">plan_id</span><span className="mono text-[11px] text-[#c7d2d7]">{selectedScenario.plan}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[#738290]">amount</span><span className="mono text-[11px] text-[#c9f36a]">{selectedScenario.amount}</span></div>
                <button type="button" onClick={() => setShowPayload((visible) => !visible)} data-testid="button-toggle-payload" className="mt-2 flex w-full items-center justify-between border-t border-[#202e3b] pt-3 text-left text-[11px] text-[#83909d] transition-colors hover:text-[#c9f36a]">
                  <span className="flex items-center gap-2"><FileCode2 className="h-3.5 w-3.5" /> {showPayload ? 'Hide raw payload' : 'Inspect raw payload'}</span><ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPayload ? 'rotate-90' : ''}`} />
                </button>
                {showPayload && <pre data-testid="text-raw-payload" className="overflow-x-auto rounded-md bg-[#0b141d] p-3 text-[10px] leading-5 text-[#83bcb9]">{`{\n  "customer_id": "${selectedScenario.customer}",\n  "plan_id": "${selectedScenario.plan}",\n  "amount": "${selectedScenario.amount.replace('$', '')}"\n}`}</pre>}
                <button type="button" onClick={submitAttempt} disabled={isRunning} data-testid="button-submit-attempt" className="mt-1 flex w-full items-center justify-center gap-2 rounded-md bg-[#c9f36a] px-4 py-3 text-xs font-bold text-[#101710] transition-all hover:bg-[#d4f980] disabled:cursor-wait disabled:opacity-60">{isRunning ? <><span className="h-3 w-3 animate-spin rounded-full border-2 border-[#101710]/30 border-t-[#101710]" /> Tracing request...</> : <><Play className="h-3.5 w-3.5 fill-current" /> {hasRun ? 'Run again' : 'Submit attempt'}</>}</button>
              </div>
            </div>

            <div data-testid="panel-response-result" className={`rounded-xl border bg-[#101a25] ${visibleResult ? (visibleOutcome?.status === 200 ? 'border-[#536f31]' : visibleOutcome?.status === 403 ? 'border-[#685430]' : 'border-[#713e3d]') : 'border-[#263543]'}`}>
              <div className="flex items-center justify-between border-b border-[#263543] px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#e5ecee]">Response / result</h3>
                  <p className="mono mt-0.5 text-[10px] text-[#657687]">transport boundary</p>
                </div>
                 {visibleResult ? (visibleOutcome?.status === 200 ? <CircleCheck className="h-4 w-4 text-[#c9f36a]" /> : <CircleX className={`h-4 w-4 ${visibleOutcome?.status === 403 ? 'text-[#ffc46b]' : 'text-[#ff8276]'}`} />) : <Clock3 className="h-4 w-4 text-[#536272]" />}
              </div>
              <div className="px-5 py-5">
                {visibleResult ? (
                  <div className="animate-in">
                    <div className="flex items-end gap-3">
                       <span data-testid="text-http-status" className={`mono text-4xl font-medium tracking-[-0.06em] ${visibleOutcome?.status === 200 ? 'text-[#c9f36a]' : visibleOutcome?.status === 403 ? 'text-[#ffc46b]' : 'text-[#ff8276]'}`}>{visibleOutcome?.status}</span>
                       <span className="mb-1 text-sm text-[#aab8bf]">{outcomeLabel}</span>
                    </div>
                     <p data-testid="text-result-message" className="mt-3 text-xs leading-5 text-[#94a2ad]">{outcomeMessage}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-[#263543] pt-3">
                      <span className="mono text-[10px] text-[#627282]">event</span>
                       <span className="mono text-[10px] text-[#7eddd5]">{outcomeEvent}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[92px] items-center gap-3 text-xs text-[#687887]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#17232e]"><Server className="h-4 w-4 text-[#526474]" /></span>
                    <span>{isRunning ? 'Waiting for the final boundary...' : 'Run a scenario to see the HTTP contract.'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="animate-in animate-in-delay-3 mt-7 border-t border-[#202d3a] pt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.17em] text-[#657687]">Architecture map</div>
              <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-[#e2eaed]">Where the responsibility lives</h3>
            </div>
            <div className="mono flex items-center gap-2 text-[10px] text-[#647586]"><span className="h-1.5 w-1.5 rounded-full bg-[#c9f36a]" /> explicit dependency direction</div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              { name: 'Adapter', subtitle: 'transport + persistence', icon: Route, color: 'cyan', items: ['HTTP controller', 'PaymentsGateway', 'SubscriptionsRepository'] },
              { name: 'Application', subtitle: 'orchestration + ports', icon: Workflow, color: 'lime', items: ['CreateSubscription', 'Command mapping', 'Transaction boundary'] },
              { name: 'Domain', subtitle: 'rules + invariants', icon: ShieldCheck, color: 'amber', items: ['Subscription entity', 'Activation policy', 'Business events'] },
            ].map((layer) => {
              const Icon = layer.icon;
              const colorClasses = layer.color === 'cyan' ? { icon: 'text-[#7eddd5] bg-[#153337]', line: 'bg-[#55d7cf]' } : layer.color === 'lime' ? { icon: 'text-[#c9f36a] bg-[#29351d]', line: 'bg-[#c9f36a]' } : { icon: 'text-[#ffc46b] bg-[#382e1d]', line: 'bg-[#ffc46b]' };
              return (
                <div key={layer.name} data-testid={`card-layer-${layer.name.toLowerCase()}`} className="group rounded-xl border border-[#263543] bg-[#101a25] p-4 transition-colors hover:border-[#405363]">
                  <div className="flex items-start justify-between">
                    <div className={`grid h-8 w-8 place-items-center rounded-lg ${colorClasses.icon}`}><Icon className="h-4 w-4" /></div>
                    <span className={`mt-2 h-1 w-10 rounded-full ${colorClasses.line}`} />
                  </div>
                  <h4 className="mt-4 text-sm font-semibold text-[#dbe5e8]">{layer.name}</h4>
                  <p className="mono mt-1 text-[10px] text-[#697987]">{layer.subtitle}</p>
                  <div className="mt-4 space-y-2 border-t border-[#263543] pt-3">
                    {layer.items.map((item) => <div key={item} className="flex items-center gap-2 text-[11px] text-[#8796a1]"><ArrowRight className="h-3 w-3 text-[#526474]" /> {item}</div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#202d3a] py-7 text-[10px] text-[#5e6e7e] sm:flex-row sm:items-center sm:justify-between">
          <span className="mono">subscription-refactor-console / local prototype</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#c9f36a]" /> Application service seam available for integration</span>
        </footer>
      </div>
    </AppShell>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <WouterRoute path="/" component={Home} />
        <WouterRoute component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;