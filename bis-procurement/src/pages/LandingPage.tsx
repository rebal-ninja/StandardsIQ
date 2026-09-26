import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Sparkles, FileUp, Scale, ShieldCheck, MessageSquare,
  ArrowRight, ChevronDown,
} from 'lucide-react';

// ── Animation presets ──────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.55, delay, ease: 'easeOut' as const },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { duration: 0.5, delay },
});

// ── Data ───────────────────────────────────────────────────────────────────
const PROBLEM_CARDS = [
  {
    title: 'Manual research is slow',
    body: 'Procurement teams spend hours cross-referencing BIS catalogues to identify applicable standards for a single specification.',
    icon: '⏱',
  },
  {
    title: 'Thousands of standards',
    body: 'The BIS catalogue contains thousands of standards across dozens of domains. Finding the relevant subset manually is error-prone.',
    icon: '📂',
  },
  {
    title: 'Technical terminology',
    body: 'Procurement specifications are written in domain language. Translating them to applicable standard identifiers requires expert knowledge.',
    icon: '🔬',
  },
  {
    title: 'Risk of non-compliance',
    body: 'Missing a relevant standard during procurement planning can result in specification gaps, disputes, or compliance failures.',
    icon: '⚠️',
  },
];

const WORKFLOW_STEPS = [
  { num: '01', title: 'Describe requirement', detail: 'Write a plain-language procurement specification — no BIS codes required.' },
  { num: '02', title: 'Retrieve relevant standards', detail: 'The RAG pipeline searches the BIS knowledge base using semantic vector similarity.' },
  { num: '03', title: 'AI explains relevance', detail: 'The LLM provides a rationale for each retrieved standard relative to your requirement.' },
  { num: '04', title: 'Compare and verify', detail: 'Review candidates side-by-side and verify their status before committing to specifications.' },
];

const CAPABILITIES = [
  {
    icon: Search,
    title: 'Semantic Standards Search',
    body: 'Search using natural-language procurement specifications. The retrieval pipeline matches against the BIS knowledge base using vector embeddings.',
    path: '/search',
  },
  {
    icon: Sparkles,
    title: 'AI-Assisted Recommendations',
    body: 'Retrieve relevant standards and receive a grounded rationale explaining why each standard may apply to your requirement.',
    path: '/recommend',
  },
  {
    icon: FileUp,
    title: 'Tender Scanning',
    body: 'Upload a tender PDF. The system extracts procurement items and maps each one to candidate BIS standards from the knowledge base.',
    path: '/scan',
  },
  {
    icon: Scale,
    title: 'Compare Standards',
    body: 'Place up to four candidate standards in a structured side-by-side comparison before making a procurement specification decision.',
    path: '/compare',
  },
  {
    icon: ShieldCheck,
    title: 'Verify Standards',
    body: 'Check a standard number or description against the indexed knowledge base to confirm status, scope, and domain classification.',
    path: '/verify',
  },
  {
    icon: MessageSquare,
    title: 'AI Insights',
    body: 'Ask questions about retrieved standards using grounded context from the knowledge base. Answers are generated from indexed BIS content.',
    path: '/recommend',
  },
];

const ARCH_STEPS = [
  { label: 'User Requirement', sub: 'Plain-language description' },
  { label: 'React Interface', sub: 'StandardsIQ frontend' },
  { label: 'FastAPI', sub: 'REST API layer' },
  { label: 'RAG Pipeline', sub: 'Retrieval-augmented generation' },
  { label: 'ChromaDB + Embeddings', sub: 'Vector similarity search' },
  { label: 'LLM Reasoning', sub: 'Rationale generation' },
  { label: 'Ranked BIS Standards', sub: 'Scored & explained results' },
];

// ── Component ──────────────────────────────────────────────────────────────
const LandingPage = () => {
  const navigate = useNavigate();
  const workflowRef = useRef<HTMLElement>(null);

  const scrollToWorkflow = () => {
    workflowRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-bg-base text-text-primary overflow-x-hidden">

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-glass-border bg-bg-base/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center">
              <div className="w-2 h-2 rounded-sm bg-accent-teal" />
            </div>
            <span className="font-bold text-text-primary tracking-tight">StandardsIQ</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-text-muted">
            <button onClick={scrollToWorkflow} className="hover:text-text-primary transition-colors">Workflow</button>
            <button onClick={() => document.getElementById('capabilities')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-text-primary transition-colors">Capabilities</button>
            <button onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-text-primary transition-colors">Architecture</button>
          </nav>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm font-semibold text-bg-base bg-accent-teal px-4 py-1.5 rounded-lg cta-glow hover:bg-opacity-90 transition-all"
          >
            Open app <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative grid-bg">
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 60% 40%, rgba(45,212,191,0.07) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center">
          {/* Left copy */}
          <div className="space-y-7">
            <motion.p
              className="text-xs font-bold tracking-[0.2em] text-accent-teal uppercase"
              {...fadeUp(0)}
            >
              AI-ASSISTED BIS STANDARDS DISCOVERY
            </motion.p>

            <motion.h1
              className="text-4xl md:text-5xl font-extrabold leading-tight text-text-primary"
              {...fadeUp(0.08)}
            >
              Find the Right Indian Standards for Every{' '}
              <span className="landing-gradient-text">Procurement Requirement.</span>
            </motion.h1>

            <motion.p
              className="text-text-muted text-lg leading-relaxed max-w-lg"
              {...fadeUp(0.15)}
            >
              StandardsIQ uses AI-assisted retrieval to discover relevant BIS standards
              from plain-language procurement specifications.
            </motion.p>

            <motion.div className="flex flex-wrap gap-3" {...fadeUp(0.22)}>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 bg-accent-teal text-bg-base font-bold px-6 py-3 rounded-xl cta-glow transition-all text-sm"
              >
                Start Discovering <ArrowRight size={16} />
              </button>
              <button
                onClick={scrollToWorkflow}
                className="flex items-center gap-2 text-text-muted border border-glass-border px-6 py-3 rounded-xl hover:border-accent-teal/40 hover:text-text-primary transition-all text-sm"
              >
                See How It Works <ChevronDown size={16} />
              </button>
            </motion.div>

            <motion.p
              className="text-xs text-text-muted"
              {...fadeUp(0.28)}
            >
              SIH 2026 · Problem Statement 26108
            </motion.p>
          </div>

          {/* Right — product preview */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
            className="hidden md:block"
          >
            <ProductPreview />
          </motion.div>
        </div>
      </section>

      {/* ── Problem ─────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-20 border-t border-glass-border">
        <motion.div className="mb-10" {...fadeUp()}>
          <h2 className="text-2xl md:text-3xl font-bold max-w-xl">
            Procurement specifications are easy to write.{' '}
            <span className="text-text-muted font-normal">Finding the applicable standards isn't.</span>
          </h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          {PROBLEM_CARDS.map((card, i) => (
            <motion.div
              key={card.title}
              className="p-5 rounded-xl border border-glass-border bg-glass-surface"
              {...fadeUp(i * 0.07)}
            >
              <div className="text-2xl mb-3" role="img" aria-hidden="true">{card.icon}</div>
              <h3 className="font-semibold mb-2 text-sm">{card.title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{card.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────────── */}
      <section ref={workflowRef} id="workflow" className="max-w-6xl mx-auto px-6 py-20 border-t border-glass-border">
        <motion.div className="mb-12 text-center" {...fadeUp()}>
          <h2 className="text-2xl md:text-3xl font-bold">
            From specification to applicable standards.
          </h2>
          <p className="text-text-muted mt-2">Four steps from requirement to decision.</p>
        </motion.div>

        {/* Desktop horizontal */}
        <div className="hidden md:grid md:grid-cols-4 gap-0">
          {WORKFLOW_STEPS.map((step, i) => (
            <motion.div key={step.num} className="relative" {...fadeUp(i * 0.1)}>
              {/* Connector line */}
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className="absolute top-6 left-1/2 w-full h-px bg-gradient-to-r from-accent-teal/40 to-transparent" aria-hidden="true" />
              )}
              <div className="relative z-10 flex flex-col items-center text-center px-4">
                <div className="w-12 h-12 rounded-xl border border-accent-teal/30 bg-accent-teal/10 flex items-center justify-center mb-4">
                  <span className="mono text-accent-teal font-bold text-sm">{step.num}</span>
                </div>
                <h3 className="font-semibold text-sm mb-2">{step.title}</h3>
                <p className="text-text-muted text-xs leading-relaxed">{step.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Mobile vertical */}
        <div className="md:hidden space-y-6">
          {WORKFLOW_STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              className="flex gap-4"
              {...fadeUp(i * 0.1)}
            >
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl border border-accent-teal/30 bg-accent-teal/10 flex items-center justify-center shrink-0">
                  <span className="mono text-accent-teal font-bold text-xs">{step.num}</span>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <div className="w-px flex-1 mt-2 bg-gradient-to-b from-accent-teal/30 to-transparent" />
                )}
              </div>
              <div className="pb-6">
                <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{step.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────────── */}
      <section id="capabilities" className="max-w-6xl mx-auto px-6 py-20 border-t border-glass-border">
        <motion.div className="mb-10" {...fadeUp()}>
          <h2 className="text-2xl md:text-3xl font-bold">Product capabilities.</h2>
          <p className="text-text-muted mt-2">Everything available in the current release.</p>
        </motion.div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {CAPABILITIES.map((cap, i) => (
            <motion.button
              key={cap.title}
              onClick={() => navigate(cap.path)}
              className="flex flex-col items-start gap-3 p-5 rounded-xl border border-glass-border bg-glass-surface hover:border-accent-teal/40 hover:bg-accent-teal/5 transition-all text-left group"
              {...fadeUp(i * 0.07)}
            >
              <div className="p-2.5 rounded-lg bg-accent-teal/10 border border-accent-teal/20 group-hover:bg-accent-teal/15 transition-colors">
                <cap.icon size={18} className="text-accent-teal" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-text-primary mb-1">{cap.title}</h3>
                <p className="text-text-muted text-sm leading-relaxed">{cap.body}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs text-accent-teal opacity-0 group-hover:opacity-100 transition-opacity">
                Open <ArrowRight size={12} />
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ── Architecture ─────────────────────────────────────────────────── */}
      <section id="architecture" className="max-w-6xl mx-auto px-6 py-20 border-t border-glass-border">
        <motion.div className="mb-12 text-center" {...fadeUp()}>
          <h2 className="text-2xl md:text-3xl font-bold">Technical architecture.</h2>
          <p className="text-text-muted mt-2">How StandardsIQ processes a procurement requirement.</p>
        </motion.div>
        <div className="max-w-sm mx-auto">
          {ARCH_STEPS.map((step, i) => (
            <motion.div key={step.label} {...fadeIn(i * 0.07)}>
              <div className="flex items-center gap-4 py-3">
                <div className="w-3 h-3 rounded-full border-2 border-accent-teal bg-accent-teal/20 shrink-0" />
                <div>
                  <div className="font-semibold text-sm">{step.label}</div>
                  <div className="text-xs text-text-muted">{step.sub}</div>
                </div>
              </div>
              {i < ARCH_STEPS.length - 1 && (
                <div className="architecture-line ml-1.5" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="border-t border-glass-border">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <motion.div {...fadeUp()}>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
              Start with a procurement requirement.
            </h2>
            <p className="text-text-muted text-lg max-w-lg mx-auto mb-8 leading-relaxed">
              Describe what you need. StandardsIQ identifies relevant BIS standards
              from its knowledge base.
            </p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 bg-accent-teal text-bg-base font-bold px-8 py-4 rounded-xl cta-glow text-base transition-all"
            >
              Open StandardsIQ <ArrowRight size={18} />
            </button>
          </motion.div>        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-glass-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-accent-teal/20 border border-accent-teal/40 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-sm bg-accent-teal" />
            </div>
            <div>
              <span className="font-semibold text-text-primary">StandardsIQ</span>
              <span className="mx-2">·</span>
              AI-assisted BIS standards discovery
            </div>
          </div>
          <div className="text-xs">
            SIH 2026 · Problem Statement 26108
          </div>
        </div>
      </footer>

    </div>
  );
};

// ── Product preview widget ─────────────────────────────────────────────────
const ProductPreview = () => (
  <div className="rounded-2xl border border-glass-border bg-glass-surface backdrop-blur-xl overflow-hidden shadow-2xl">
    {/* Fake window chrome */}
    <div className="flex items-center gap-2 px-4 py-3 border-b border-glass-border bg-white/[0.03]">
      <div className="w-2.5 h-2.5 rounded-full bg-accent-red/60" />
      <div className="w-2.5 h-2.5 rounded-full bg-accent-amber/60" />
      <div className="w-2.5 h-2.5 rounded-full bg-accent-teal/60" />
      <span className="ml-3 mono text-xs text-text-muted">StandardsIQ · Search</span>
    </div>
    {/* Fake search bar */}
    <div className="px-5 py-4 border-b border-glass-border">
      <div className="flex items-center gap-3 bg-white/[0.04] border border-glass-border rounded-lg px-4 py-2.5">
        <Search size={14} className="text-text-muted shrink-0" />
        <span className="text-text-muted text-sm">High tensile structural steel for bridges…</span>
        <div className="ml-auto w-6 h-6 rounded-md bg-accent-teal/20 flex items-center justify-center">
          <ArrowRight size={12} className="text-accent-teal" />
        </div>
      </div>
    </div>
    {/* Fake results */}
    <div className="px-5 py-4 space-y-3">
      {[
        { id: 'IS 2062:2011', score: 94, title: 'Hot Rolled Medium & High Tensile Structural Steel', domain: 'Construction' },
        { id: 'IS 1786:2008', score: 81, title: 'High Strength Deformed Steel Bars for Concrete Reinforcement', domain: 'Construction' },
        { id: 'IS 8500:1991', score: 72, title: 'Structural Steel — Micro-alloyed (Medium & High Strength)', domain: 'Construction' },
      ].map(r => (
        <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-glass-border bg-white/[0.02]">
          {/* Mini score circle */}
          <svg width="32" height="32" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} aria-hidden="true">
            <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3.5" />
            <circle
              cx="16" cy="16" r="12" fill="none"
              stroke="#2DD4BF" strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 12}
              strokeDashoffset={2 * Math.PI * 12 * (1 - r.score / 100)}
            />
          </svg>
          <div className="min-w-0">
            <div className="mono text-accent-teal text-xs font-semibold">{r.id}</div>
            <div className="text-xs font-medium text-text-primary mt-0.5 leading-snug">{r.title}</div>
            <div className="text-xs text-text-muted mt-0.5">{r.domain}</div>
          </div>
        </div>
      ))}
    </div>
    {/* Footer of preview */}
    <div className="px-5 py-3 border-t border-glass-border flex items-center justify-between text-xs text-text-muted bg-white/[0.02]">
      <span>3 standards retrieved</span>
      <span className="mono">0.42s</span>
    </div>
  </div>
);

export default LandingPage;
