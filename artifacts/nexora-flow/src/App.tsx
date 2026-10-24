import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, Building2, Check,
  ChevronDown, CircleHelp, Clock3, Command, ContactRound, LayoutDashboard, ListTodo,
  LoaderCircle, LockKeyhole, LogOut, Mail, Menu, MessageCircleMore, MoveRight, Plus,
  Search, Settings2, Sparkles, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CrmRoute } from '@/components/crm-pages';

const queryClient = new QueryClient();
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type Workspace = { workspace_id: string; role: 'owner' | 'admin' | 'member' | 'readonly'; name: string };
type AuthState = {
  client: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
  workspace: Workspace | null;
  workspaceChecked: boolean;
  workspaceLoading: boolean;
  workspaceError: string;
  reloadWorkspace: () => Promise<Workspace | null>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth context is missing');
  return value;
};

function AuthProvider({ children }: { children: ReactNode }) {
  const userIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceChecked, setWorkspaceChecked] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');

  const reloadWorkspace = async () => {
    if (!supabase || !session?.user.id) return null;
    setWorkspaceLoading(true);
    setWorkspaceError('');
    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(name)')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setWorkspaceLoading(false);
    setWorkspaceChecked(true);
    if (error) {
      setWorkspace(null);
      setWorkspaceError(error.message || 'We could not check your workspace access.');
      return null;
    }
    if (!data) {
      setWorkspace(null);
      return null;
    }
    const related = data.workspaces as unknown as { name?: string } | null;
    const result: Workspace = {
      workspace_id: data.workspace_id,
      role: data.role as Workspace['role'],
      name: related?.name || 'Your workspace',
    };
    setWorkspace(result);
    return result;
  };

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (nextUserId !== userIdRef.current) {
        userIdRef.current = nextUserId;
        setWorkspaceChecked(!nextUserId);
        queryClient.clear();
      }
      setSession(nextSession);
      if (!nextSession) {
        setWorkspace(null);
        setWorkspaceError('');
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setWorkspaceError(error.message);
      userIdRef.current = data.session?.user.id ?? null;
      setWorkspaceChecked(!data.session);
      setSession(data.session);
      setLoading(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session?.user.id) void reloadWorkspace();
    else { setWorkspace(null); setWorkspaceChecked(true); }
  // Session id is the stable key; reloadWorkspace is intentionally not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const value = useMemo<AuthState>(() => ({
    client: supabase, session, loading, workspace, workspaceChecked, workspaceLoading, workspaceError,
    reloadWorkspace,
    signOut: async () => { if (supabase) await supabase.auth.signOut(); queryClient.clear(); },
  }), [session, loading, workspace, workspaceChecked, workspaceLoading, workspaceError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function Brand({ small = false }: { small?: boolean }) {
  return <Link href="/" aria-label="Nexora Flow home" className="inline-flex items-center gap-2.5" data-testid="link-brand-home">
    <span className={`grid place-items-center rounded-xl bg-[#c8f05b] text-[#202822] ${small ? 'h-8 w-8' : 'h-9 w-9'}`}>
      <Command size={small ? 17 : 19} strokeWidth={2.6} />
    </span>
    <span className="display-font text-[18px] font-extrabold tracking-[-.055em] text-[#202822]">nexora<span className="font-medium text-[#74806d]">flow</span></span>
  </Link>;
}

function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c8f05b] px-5 text-sm font-bold text-[#202822] transition hover:bg-[#b9e548] disabled:cursor-not-allowed disabled:opacity-55 ${className}`}>{children}</button>;
}

function SetupMessage() {
  return <div className="rounded-2xl border border-[#e7d7a3] bg-[#fff9e9] p-5 text-sm text-[#645630]" role="alert" data-testid="status-supabase-setup">
    <div className="flex gap-3"><CircleHelp size={19} className="mt-0.5 shrink-0" />
      <div><p className="font-bold">Connect Supabase to continue</p>
        <p className="mt-1 leading-6">Add <code className="rounded bg-white/70 px-1 py-0.5">VITE_SUPABASE_URL</code> and <code className="rounded bg-white/70 px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> to this app’s environment, then reload. Use the public anon/publishable key only.</p>
      </div>
    </div>
  </div>;
}

function LoadingScreen({ label = 'Getting your workspace ready' }: { label?: string }) {
  return <div className="grid min-h-[55vh] place-items-center" aria-live="polite"><div className="w-full max-w-sm space-y-4 px-6">
    <div className="h-2.5 w-28 animate-pulse rounded-full bg-[#e3e7d8]" />
    <div className="h-9 w-3/4 animate-pulse rounded-xl bg-[#e9ebdf]" />
    <div className="h-24 animate-pulse rounded-2xl bg-[#eeefe7]" />
    <p className="text-sm text-[#70786c]">{label}…</p>
  </div></div>;
}

function PublicHeader() {
  return <header className="mx-auto flex h-[76px] max-w-[1240px] items-center justify-between px-5 sm:px-8">
    <Brand />
    <nav className="flex items-center gap-2 sm:gap-7">
      <a href="#how-it-works" className="hidden text-sm font-medium text-[#657064] hover:text-[#202822] sm:block">How it works</a>
      <a href="#pricing-preview" className="hidden text-sm font-medium text-[#657064] hover:text-[#202822] sm:block">Pricing</a>
      <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#4d584d] hover:bg-[#eff0e8]" data-testid="link-login">Log in</Link>
      <Link href="/signup" className="inline-flex h-10 items-center rounded-xl bg-[#c8f05b] px-4 text-sm font-bold text-[#202822] hover:bg-[#b9e548]" data-testid="link-signup">Get started</Link>
    </nav>
  </header>;
}

function Landing() {
  return <div className="min-h-[100dvh] overflow-hidden bg-[#f7f7f1]">
    <PublicHeader />
    <main>
      <section className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-20 pt-12 sm:px-8 lg:min-h-[650px] lg:grid-cols-[1.02fr_.98fr] lg:gap-5 lg:pb-24 lg:pt-6">
        <div className="relative z-10 max-w-[620px] page-enter">
          <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dfe4d4] bg-white/70 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[.15em] text-[#65705e]"><span className="h-2 w-2 rounded-full bg-[#a2ce37]" /> Your business, in motion</p>
          <h1 className="display-font max-w-[650px] text-[clamp(3.25rem,8vw,6.4rem)] font-semibold leading-[.99] tracking-[-.075em] text-[#202822]">The right next<br className="hidden sm:block" /> move, <span className="relative inline-block">always.<span className="absolute -bottom-1 left-1 right-0 h-[.15em] -rotate-2 rounded-full bg-[#c8f05b]" /></span></h1>
          <p className="mt-7 max-w-[480px] text-lg leading-8 text-[#697267]">Your customers. Your next move. All in one place.</p>
          <p className="mt-2 max-w-[440px] text-[15px] leading-7 text-[#7b8377]">A lighter CRM for the busy owner—so every good conversation has a clear next step.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="group inline-flex h-12 items-center gap-3 rounded-xl bg-[#c8f05b] px-5 text-sm font-bold text-[#202822] transition hover:-translate-y-0.5 hover:bg-[#b9e548]" data-testid="link-hero-start">Start with Nexora <ArrowRight size={17} className="transition group-hover:translate-x-0.5" /></Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-xl px-5 text-sm font-semibold text-[#596357] hover:bg-[#edeee6]" data-testid="link-hero-login">I already have an account</Link>
          </div>
          <div className="mt-10 flex items-center gap-3 text-xs text-[#81887d]"><div className="flex -space-x-2">{['N','F','S'].map((letter, i) => <span key={letter} className={`grid h-8 w-8 place-items-center rounded-full border-2 border-[#f7f7f1] text-[10px] font-bold ${i === 1 ? 'bg-[#e9c8ad]' : i === 2 ? 'bg-[#d4dfb8]' : 'bg-[#e2e3d9]'}`}>{letter}</span>)}</div><span>Built for the way small teams actually work</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-[550px] page-enter [animation-delay:120ms]">
          <div className="absolute -right-14 -top-16 h-72 w-72 rounded-full bg-[#e5efc9] blur-3xl" />
          <div className="relative rounded-[26px] border border-[#e1e2d9] bg-white p-3 shadow-[0_24px_80px_-36px_rgba(46,59,38,.28)]">
            <div className="flex items-center justify-between border-b border-[#eceee6] px-3 pb-3 pt-2">
              <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#c8f05b]" /><span className="text-xs font-bold tracking-tight">Today, at a glance</span></div>
              <span className="rounded-lg bg-[#f5f6f0] px-2.5 py-1.5 text-[10px] text-[#737d6e]">Your workspace</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 p-1 pt-3">
              <div className="col-span-2 rounded-2xl bg-[#f5f6f0] p-4 sm:p-5">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#778072]">Your next move</span><ArrowUpRight size={16} className="text-[#73816b]" /></div>
                <p className="display-font mt-4 text-[23px] font-semibold tracking-[-.045em] text-[#303a30]">Make room for what matters.</p>
                <p className="mt-1 text-xs leading-5 text-[#7b8378]">Keep your follow-ups and customer context together.</p>
              </div>
              <div className="rounded-2xl border border-[#eceee6] p-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff5df]"><ContactRound size={16} /></div><p className="mt-5 text-[11px] text-[#788174]">Contacts</p><p className="mt-1 text-sm font-bold">One clear view</p></div>
              <div className="rounded-2xl border border-[#eceee6] p-4"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3eee6]"><ListTodo size={16} /></div><p className="mt-5 text-[11px] text-[#788174]">Follow-through</p><p className="mt-1 text-sm font-bold">Never lose the thread</p></div>
              <div className="col-span-2 flex items-center gap-3 rounded-xl bg-[#202822] p-4 text-white"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#c8f05b] text-[#202822]"><Sparkles size={17} /></span><div className="min-w-0"><p className="text-xs font-semibold">A calmer way to stay close</p><p className="mt-0.5 text-[10px] text-white/55">Your relationships, without the CRM overhead.</p></div><MoveRight size={17} className="ml-auto text-[#c8f05b]" /></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-6 hidden items-center gap-3 rounded-2xl border border-[#e2e4dc] bg-white px-4 py-3 shadow-lg sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#eaf4d4]"><Check size={16} /></span><span className="text-xs font-semibold">A little less to remember</span></div>
        </div>
      </section>
      <section id="how-it-works" className="border-y border-[#e7e8df] bg-[#f0f1e9]">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[.72fr_1.28fr] md:items-center md:py-20">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#78836e]">A better kind of CRM</p><h2 className="display-font mt-4 text-3xl font-semibold tracking-[-.055em] sm:text-[42px]">Built around the<br />next useful thing.</h2></div>
          <div className="grid gap-6 sm:grid-cols-3">
            {[['01','Keep context close','Remember the details that make a customer feel known.'],['02','See what needs you','Find your follow-ups without digging through a maze.'],['03','Move at your pace','A small, dependable workspace that stays out of your way.']].map(([n,title,body])=><article key={n} className="border-t border-[#d9ddd1] pt-4"><span className="text-[11px] font-mono text-[#88917f]">{n} /</span><h3 className="mt-5 text-sm font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#778073]">{body}</p></article>)}
          </div>
        </div>
      </section>
      <section id="pricing-preview" className="mx-auto max-w-[1240px] px-5 py-16 sm:px-8 md:py-20">
        <div className="grid gap-8 md:grid-cols-[.78fr_1.22fr] md:items-end">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#78836e]">Straightforward by design</p><h2 className="display-font mt-4 text-3xl font-semibold tracking-[-.055em] sm:text-[42px]">A simple place<br className="hidden sm:block" /> to start.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-[#778073]">Begin with the essentials. We’ll share more when the options are ready.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[20px] border border-[#dfe4d4] bg-white p-5 sm:p-6">
              <span className="inline-flex rounded-full bg-[#edf4df] px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#60734b]">Free starting option</span>
              <h3 className="display-font mt-5 text-xl font-semibold tracking-[-.04em] text-[#303a30]">Start with Nexora</h3>
              <p className="mt-2 text-sm leading-6 text-[#7b8378]">A lighter CRM to keep customer context and your next move together.</p>
              <Link href="/signup" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-[#46543b] hover:text-[#253322]" data-testid="link-pricing-free">Create an account <ArrowRight size={14} /></Link>
            </article>
            <article className="rounded-[20px] border border-[#e2e4dc] bg-[#f0f1e9] p-5 sm:p-6">
              <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#858c80]">Coming soon</span>
              <h3 className="display-font mt-5 text-xl font-semibold tracking-[-.04em] text-[#465044]">Paid plans</h3>
              <p className="mt-2 text-sm leading-6 text-[#7b8378]">More options are being considered. No paid plan or billing is live yet.</p>
              <p className="mt-5 text-xs font-semibold text-[#737d6e]">Pricing is not finalized.</p>
            </article>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1240px] gap-8 px-5 py-16 sm:px-8 md:grid-cols-[1fr_auto] md:items-center md:py-24">
        <div><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[#78836e]"><Clock3 size={15} /> More thoughtful follow-through</span><h2 className="display-font mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-.06em] sm:text-5xl">Spend less time managing your CRM. More time with your people.</h2></div>
        <Link href="/signup" className="inline-flex h-12 w-fit items-center gap-2 rounded-xl bg-[#202822] px-5 text-sm font-semibold text-white transition hover:bg-[#354035]" data-testid="link-bottom-start">Get started <ArrowRight size={16} /></Link>
      </section>
      <footer className="border-t border-[#e6e7df]"><div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-7 text-xs text-[#858b80] sm:flex-row sm:items-center sm:justify-between sm:px-8"><Brand small /><span>Your customers. Your next move. All in one place.</span><span>© {new Date().getFullYear()} Nexora Flow</span></div></footer>
    </main>
  </div>;
}

function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const signup = mode === 'signup';
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSuccess('');
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    if (!auth.client) { setError('Supabase is not configured yet. Add the environment values below before continuing.'); return; }
    setPending(true);
    try {
      if (signup) {
        const { data, error: authError } = await auth.client.auth.signUp({ email: cleanEmail, password });
        if (authError) throw authError;
        if (data.session) setLocation('/app/today');
        else setSuccess('Check your inbox for a confirmation link. Once you confirm your email, come back here to log in.');
      } else {
        const { error: authError } = await auth.client.auth.signInWithPassword({ email: cleanEmail, password });
        if (authError) throw authError;
        setLocation('/app/today');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'We could not complete that request. Try again.'); }
    finally { setPending(false); }
  };
  return <div className="min-h-[100dvh] bg-[#f7f7f1]">
    <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8"><Brand /><Link href="/" className="flex items-center gap-2 text-sm font-medium text-[#6d766a] hover:text-[#252d25]"><ArrowLeft size={15} /> Back home</Link></div>
    <main className="mx-auto grid max-w-[1050px] items-center gap-12 px-5 pb-14 pt-8 sm:px-8 md:grid-cols-[1fr_.9fr] md:pt-16">
      <div className="hidden md:block"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#7b8672]">{signup ? 'A fresh start' : 'Welcome back'}</p><h1 className="display-font mt-5 text-[52px] font-semibold leading-[1.02] tracking-[-.065em]">{signup ? 'Build better customer habits.' : 'Pick up where your people are.'}</h1><p className="mt-5 max-w-sm text-base leading-7 text-[#737c70]">Your customers. Your next move. All in one place.</p><div className="mt-12 flex items-center gap-4 border-t border-[#e0e2d8] pt-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf3d7]"><LockKeyhole size={18} /></div><p className="text-xs leading-5 text-[#7e857b]">Your workspace is private and protected by Supabase authentication.</p></div></div>
      <div className="rounded-[24px] border border-[#e5e6dd] bg-white p-6 shadow-[0_20px_60px_-40px_rgba(36,50,31,.25)] sm:p-9">
        <p className="text-[11px] font-bold uppercase tracking-[.15em] text-[#8a9382]">{signup ? 'Create your account' : 'Sign in'}</p>
        <h2 className="display-font mt-2 text-3xl font-semibold tracking-[-.05em]">{signup ? 'Start with the essentials.' : 'Good to see you.'}</h2>
        <p className="mt-2 text-sm text-[#7b8378]">{signup ? 'No clutter. Just a clearer next step.' : 'Your customers are right where you left them.'}</p>
        <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[#566052]">Email address</span><span className="relative block"><Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#899184]" /><input data-testid="input-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className="h-12 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] pl-11 pr-4 text-sm outline-none transition placeholder:text-[#a1a79d] focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20" /></span></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-[#566052]">Password</span><input data-testid="input-password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters" className="h-12 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-4 text-sm outline-none transition placeholder:text-[#a1a79d] focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20" /></label>
          {error && <p role="alert" data-testid="status-auth-error" className="rounded-xl border border-[#f0c7c1] bg-[#fff4f2] px-4 py-3 text-sm leading-5 text-[#a7473b]">{error}</p>}
          {success && <p role="status" data-testid="status-auth-success" className="rounded-xl border border-[#dce7c8] bg-[#f4f8e9] px-4 py-3 text-sm leading-5 text-[#536b32]">{success}</p>}
          {!auth.client && <div className="pt-1"><SetupMessage /></div>}
          <Button type="submit" disabled={pending || !auth.client} className="w-full">{pending ? <><LoaderCircle size={16} className="animate-spin" /> {signup ? 'Creating account…' : 'Signing in…'}</> : <>{signup ? 'Create account' : 'Log in'} <ArrowRight size={16} /></>}</Button>
        </form>
        <p className="mt-6 text-center text-sm text-[#788074]">{signup ? 'Already have an account?' : 'New to Nexora Flow?'} <Link href={signup ? '/login' : '/signup'} className="font-bold text-[#394436] underline decoration-[#c8f05b] decoration-2 underline-offset-4" data-testid={signup ? 'link-auth-login' : 'link-auth-signup'}>{signup ? 'Log in' : 'Create an account'}</Link></p>
        <p className="mt-6 border-t border-[#eff0eb] pt-4 text-center text-[11px] leading-5 text-[#979d92]">By continuing, you agree to keep your account details secure.</p>
      </div>
    </main>
  </div>;
}

const navItems = [
  { href: '/app/today', label: 'Today', icon: LayoutDashboard },
  { href: '/app/contacts', label: 'Contacts', icon: ContactRound },
  { href: '/app/companies', label: 'Companies', icon: Building2 },
  { href: '/app/deals', label: 'Deals', icon: BriefcaseBusiness },
  { href: '/app/tasks', label: 'Tasks', icon: ListTodo },
  { href: '/app/assistant', label: 'Assistant', icon: Sparkles },
];

function AuthShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [signoutPending, setSignoutPending] = useState(false);
  const activePath = location;
  useEffect(() => {
    if (!auth.loading && !auth.session) setLocation('/login');
    else if (auth.session && auth.workspaceChecked && !auth.workspace && activePath !== '/onboarding') setLocation('/onboarding');
    else if (auth.session && auth.workspaceChecked && auth.workspace && activePath === '/onboarding') setLocation('/app/today');
  }, [auth.loading, auth.session, auth.workspaceChecked, auth.workspace, activePath, setLocation]);
  if (!auth.client) return <div className="min-h-[100dvh] bg-[#f7f7f1]"><div className="mx-auto max-w-3xl px-5 pt-10"><Brand /><div className="mt-12"><SetupMessage /></div></div></div>;
  if (auth.loading || auth.session && (!auth.workspaceChecked || auth.workspaceLoading)) return <div className="min-h-[100dvh] bg-[#f7f7f1]"><div className="p-6"><Brand /></div><LoadingScreen /></div>;
  if (!auth.session) return null;
  if (auth.workspaceError) return <div className="min-h-[100dvh] bg-[#f7f7f1]"><div className="mx-auto max-w-3xl px-5 pt-10"><Brand /><div className="mt-12 rounded-2xl border border-[#efc9c2] bg-[#fff5f3] p-6" role="alert"><h1 className="display-font text-xl font-bold">We couldn’t check your workspace</h1><p className="mt-2 text-sm leading-6 text-[#83584f]">{auth.workspaceError}</p><div className="mt-5 flex gap-3"><Button onClick={()=>void auth.reloadWorkspace()}>Try again</Button><button className="px-3 text-sm font-semibold" onClick={()=>void auth.signOut()}>Sign out</button></div></div></div></div>;
  if (!auth.workspace && activePath !== '/onboarding') return null;
  if (auth.workspace && activePath === '/onboarding') return null;
  if (activePath === '/onboarding') return <Onboarding />;

  const logout = async () => { setSignoutPending(true); await auth.signOut(); setSignoutPending(false); setLocation('/'); };
  const nav = <nav aria-label="Main navigation" className="space-y-1">{navItems.map(item => {
    const active = activePath === item.href || item.href === '/app/contacts' && activePath.startsWith('/app/contacts/');
    const Icon = item.icon;
    return <Link key={item.href} href={item.href} onClick={()=>setMobileNav(false)} aria-current={active ? 'page' : undefined} data-testid={`nav-${item.label.toLowerCase()}`} className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${active ? 'bg-[#eaf2da] text-[#34402f]' : 'text-[#727b6f] hover:bg-[#eff0e9] hover:text-[#273128]'}`}><Icon size={17} strokeWidth={active ? 2.2 : 1.8} />{item.label}{item.label === 'Assistant' && <span className="ml-auto rounded-full bg-[#e9e9e0] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#858a80]">Soon</span>}</Link>;
  })}</nav>;

  return <div className="min-h-[100dvh] bg-[#f7f7f1]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col border-r border-[#e4e5dc] bg-[#f8f8f3] px-4 py-5 md:flex">
      <div className="px-2"><Brand /></div>
      <div className="mt-9 rounded-xl border border-[#e4e6dc] bg-white/75 px-3 py-3"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#969d91]">Workspace</p><div className="mt-1.5 flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-[#374136]" title={auth.workspace?.name}>{auth.workspace?.name}</span><ChevronDown size={14} className="shrink-0 text-[#8f9789]" /></div></div>
      <p className="mb-2 mt-8 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#9ba194]">Your workspace</p>{nav}
      <div className="mt-auto">
        <div className="mb-4 rounded-2xl bg-[#202822] p-4 text-white"><p className="text-[11px] font-semibold">Keep the next step close.</p><p className="mt-1.5 text-[10px] leading-4 text-white/55">A clear place for your customer relationships.</p><div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#c8f05b]">Nexora Flow <ArrowUpRight size={12} /></div></div>
        <Link href="/app/settings" className={`flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold ${activePath === '/app/settings' ? 'bg-[#eaf2da] text-[#34402f]' : 'text-[#727b6f] hover:bg-[#eff0e9]'}`} data-testid="nav-settings"><Settings2 size={17} />Settings</Link>
        <button onClick={logout} disabled={signoutPending} className="mt-1 flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-semibold text-[#727b6f] hover:bg-[#eff0e9] disabled:opacity-50" data-testid="button-signout"><LogOut size={17} />{signoutPending ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </aside>
    {mobileNav && <div className="fixed inset-0 z-50 bg-[#202822]/35 md:hidden" onClick={()=>setMobileNav(false)}><aside className="flex h-full w-[min(82vw,300px)] flex-col bg-[#f8f8f3] px-4 py-5 shadow-xl" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between px-2"><Brand /><button aria-label="Close navigation" onClick={()=>setMobileNav(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#e9ebe1]"><X size={19} /></button></div><div className="mt-8 rounded-xl border border-[#e4e6dc] bg-white/75 px-3 py-3"><p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#969d91]">Workspace</p><p className="mt-1.5 truncate text-xs font-bold">{auth.workspace?.name}</p></div><div className="mt-7">{nav}</div><Link href="/app/settings" onClick={()=>setMobileNav(false)} className="mt-2 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#727b6f]"><Settings2 size={17} />Settings</Link><button onClick={logout} className="mt-auto flex h-11 items-center gap-3 px-3 text-sm font-semibold text-[#727b6f]"><LogOut size={17} />Sign out</button></aside></div>}
    <div className="min-h-[100dvh] md:pl-[244px]">
      <header className="sticky top-0 z-20 flex h-[66px] items-center justify-between border-b border-[#e7e8e0] bg-[#f7f7f1]/95 px-4 backdrop-blur-md sm:px-7">
        <div className="flex items-center gap-3"><button onClick={()=>setMobileNav(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-[#e1e3d9] bg-white md:hidden" aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={18} /></button><div className="hidden items-center gap-2 text-xs text-[#92998e] sm:flex"><span>Nexora Flow</span><span>/</span><span className="font-semibold text-[#374137]">{navItems.find(item=>item.href===activePath)?.label || (activePath.includes('/contacts/') ? 'Contact details' : activePath==='/app/companies' ? 'Companies' : activePath==='/app/settings' ? 'Settings' : 'Workspace')}</span></div><span className="sm:hidden"><Brand small /></span></div>
        <div className="flex items-center gap-2 sm:gap-4"><span className="hidden rounded-full border border-[#e1e3da] bg-white px-3 py-1.5 text-[10px] font-semibold capitalize text-[#737d70] sm:block">{auth.workspace?.role}</span><button disabled className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-full border border-[#e1e3da] bg-white text-[#a3a99f]" aria-label="Notifications unavailable" title="Notifications are not available yet" data-testid="button-notifications"><Bell size={16} /></button><span className="grid h-8 w-8 place-items-center rounded-full bg-[#e4e9d9] text-[11px] font-bold text-[#48533e]">{auth.session?.user.email?.slice(0,1).toUpperCase()}</span></div>
      </header>
      <main className="mx-auto max-w-[1120px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10"><ErrorBoundary resetKey={activePath}>{children}</ErrorBoundary></main>
    </div>
  </div>;
}

function Onboarding() {
  const auth = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const createWorkspace = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const cleanName = name.trim();
    if (cleanName.length < 2) { setError('Workspace name must be at least 2 characters.'); return; }
    if (!auth.client) { setError('Supabase is not configured. Add the required environment values to continue.'); return; }
    const slug = cleanName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) { setError('Choose a name that includes at least one letter or number.'); return; }
    setPending(true);
    const { data, error: rpcError } = await auth.client.rpc('create_workspace', { p_name: cleanName, p_slug: slug });
    if (rpcError) { setError(rpcError.message || 'We could not create your workspace. Please try again.'); setPending(false); return; }
    if (typeof data !== 'string' || !data) { setError('Workspace creation returned an unexpected response. Please contact support.'); setPending(false); return; }
    setCreated(true);
    const membership = await auth.reloadWorkspace();
    setPending(false);
    if (membership) setLocation('/app/today');
    else setError('Your workspace was created, but membership is not visible yet. Try checking again in a moment.');
  };
  return <div className="min-h-[100dvh] bg-[#f7f7f1]">
    <header className="mx-auto flex max-w-[1100px] items-center justify-between px-5 py-5 sm:px-8"><Brand /><button onClick={()=>void auth.signOut()} className="text-sm font-semibold text-[#687365] hover:text-[#252d25]">Sign out</button></header>
    <main className="mx-auto grid max-w-[980px] gap-12 px-5 pb-16 pt-9 sm:px-8 md:grid-cols-[.9fr_1.1fr] md:pt-16">
      <section><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#7b8672]">One small setup</p><h1 className="display-font mt-4 text-[43px] font-semibold leading-[1.02] tracking-[-.065em] sm:text-[52px]">Make this space yours.</h1><p className="mt-5 max-w-sm text-[15px] leading-7 text-[#737c70]">Give your workspace a name. Your team can find all of its customer work here.</p><div className="mt-10 flex items-start gap-3 rounded-2xl border border-[#e1e4d9] bg-white/70 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#edf4df]"><LockKeyhole size={15} /></span><p className="text-xs leading-5 text-[#778073]">You’ll be set as the owner. Workspace access is managed securely by your account.</p></div></section>
      <section className="rounded-[24px] border border-[#e5e6dd] bg-white p-6 shadow-[0_20px_60px_-40px_rgba(36,50,31,.25)] sm:p-9"><h2 className="display-font text-2xl font-semibold tracking-[-.04em]">Name your workspace</h2><p className="mt-2 text-sm text-[#7b8378]">You can change this later.</p><form onSubmit={createWorkspace} className="mt-7 space-y-5"><label className="block"><span className="mb-2 block text-xs font-bold text-[#566052]">Workspace name</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required autoFocus placeholder="e.g. Northstar Studio" data-testid="input-workspace-name" className="h-12 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-4 text-sm outline-none transition placeholder:text-[#a1a79d] focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20" /></label>{error && <p role="alert" data-testid="status-onboarding-error" className={`rounded-xl border px-4 py-3 text-sm leading-5 ${created ? 'border-[#e7d7a3] bg-[#fff9e9] text-[#645630]' : 'border-[#f0c7c1] bg-[#fff4f2] text-[#a7473b]'}`}>{error}</p>}<Button type="submit" disabled={pending || !auth.client} className="w-full">{pending ? <><LoaderCircle size={16} className="animate-spin" /> Creating workspace…</> : <>Create workspace <ArrowRight size={16} /></>}</Button>{!auth.client && <SetupMessage />}</form></section>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#839078]">{eyebrow}</p><h1 className="display-font mt-2 text-[34px] font-semibold leading-tight tracking-[-.06em] text-[#273128] sm:text-[42px]">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-[#778073]">{description}</p></div>{action}</div>;
}

function BlankPanel({ icon: Icon, title, description, footer }: { icon: LucideIcon; title: string; description: string; footer?: ReactNode }) {
  return <div className="mt-8 flex min-h-[300px] flex-col items-center justify-center rounded-[22px] border border-dashed border-[#d9ddd2] bg-[#fbfbf7] px-6 py-10 text-center" data-testid="empty-state">
    <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-[#eef3e5] text-[#606f51]"><Icon size={23} strokeWidth={1.7} /></span>
    <h2 className="display-font mt-5 text-xl font-semibold tracking-[-.035em] text-[#354035]">{title}</h2>
    <p className="mt-2 max-w-[390px] text-sm leading-6 text-[#7b8378]">{description}</p>
    {footer && <div className="mt-5">{footer}</div>}
  </div>;
}

function TodayPage() {
  return <div className="page-enter"><div className="mb-8 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[#7c8578]">A clear start to your customer day.</p><p className="rounded-full border border-[#e1e4d9] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#70796d]">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p></div>
    <PageHeading eyebrow="Today" title="Your next move." description="A simple place to see what needs your attention. Your workspace is ready when you are." />
    <div className="mt-8 grid gap-4 md:grid-cols-[1.35fr_.65fr]">
      <section className="rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eff4e4]"><ListTodo size={16} /></span><h2 className="text-sm font-bold">Up next</h2></div><span className="rounded-full bg-[#f2f3ed] px-2.5 py-1 text-[10px] font-semibold text-[#858b80]">No tasks yet</span></div><div className="mt-5 rounded-xl border border-dashed border-[#e0e3d9] bg-[#fbfbf7] px-4 py-5"><p className="text-sm font-semibold text-[#5c6758]">Nothing on the list just yet</p><p className="mt-1 text-xs leading-5 text-[#8a9185]">Tasks you create will show up here when they’re ready for your attention.</p><Link href="/app/tasks" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#596a42] hover:text-[#36472c]">Visit tasks <ArrowRight size={14} /></Link></div></section>
      <section className="rounded-[22px] bg-[#202822] p-5 text-white sm:p-6"><div className="flex items-center gap-2 text-[#c8f05b]"><Sparkles size={17} /><span className="text-[10px] font-bold uppercase tracking-[.15em]">A lighter CRM</span></div><h2 className="display-font mt-5 text-2xl font-semibold leading-tight tracking-[-.045em]">Keep the human part in focus.</h2><p className="mt-2 text-xs leading-5 text-white/60">Start with a contact or a deal when you’re ready. You’ll always know where things stand.</p><Link href="/app/contacts" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15">Explore contacts <ArrowRight size={14} /></Link></section>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><Link href="/app/contacts" className="group flex items-center justify-between rounded-[18px] border border-[#e3e5dc] bg-white p-5 transition hover:border-[#c7d1b7]" data-testid="card-today-contacts"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff4e4] text-[#63734f]"><ContactRound size={18} /></span><div><p className="text-sm font-bold">Contacts</p><p className="mt-1 text-xs text-[#838b7e]">Keep customer details together</p></div></div><ArrowRight size={17} className="text-[#939a8d] transition group-hover:translate-x-1" /></Link><Link href="/app/deals" className="group flex items-center justify-between rounded-[18px] border border-[#e3e5dc] bg-white p-5 transition hover:border-[#c7d1b7]" data-testid="card-today-deals"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4eee4] text-[#78664a]"><BriefcaseBusiness size={18} /></span><div><p className="text-sm font-bold">Deals</p><p className="mt-1 text-xs text-[#838b7e]">Keep opportunities moving</p></div></div><ArrowRight size={17} className="text-[#939a8d] transition group-hover:translate-x-1" /></Link></div>
  </div>;
}

function ContactsPage() {
  return <div className="page-enter"><PageHeading eyebrow="Relationships" title="Contacts" description="A thoughtful home for the people who make your business what it is." action={<Button disabled title="Contact creation is not available yet"><Plus size={16} />Add contact</Button>} /><div className="mt-7 flex flex-col gap-3 rounded-2xl border border-[#e4e6dc] bg-white p-4 sm:flex-row sm:items-center"><span className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#939b8f]" /><input type="search" aria-label="Search contacts" disabled placeholder="Search contacts" className="h-10 w-full rounded-xl border border-[#e6e8e0] bg-[#fafaf7] pl-10 pr-3 text-sm placeholder:text-[#a0a69b] disabled:cursor-not-allowed" data-testid="input-search-contacts" /></span><span className="text-[11px] text-[#959b91]">Search will be available when contacts are added</span></div><BlankPanel icon={ContactRound} title="No contacts yet" description="When you add a customer or connection, their details and the next useful step will live here." /></div>;
}

function ContactDetailPage() {
  return <div className="page-enter"><Link href="/app/contacts" className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-[#758071] hover:text-[#354035]"><ArrowLeft size={15} />Back to contacts</Link><PageHeading eyebrow="Contact details" title="Contact not found" description="There are no contacts in this workspace yet, so there’s nothing to open here." /><BlankPanel icon={ContactRound} title="Your contact list is empty" description="Once a contact exists in this workspace, you’ll be able to see their details here." footer={<Link href="/app/contacts" className="inline-flex items-center gap-2 rounded-lg border border-[#dfe3d8] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#f7f8f2]">Go to contacts <ArrowRight size={14} /></Link>} /></div>;
}

function DealsPage() {
  return <div className="page-enter"><PageHeading eyebrow="Opportunities" title="Deals" description="A clear view of the work that could be next for your business." action={<Button disabled title="Deal creation is not available yet"><Plus size={16} />Add deal</Button>} /><div className="mt-8 grid gap-3 sm:grid-cols-3">{[['Open','Nothing moving yet',ArrowUpRight],['Won','Room for your first win',Check],['Lost','No closed deals',ArrowDownRight]].map(([label,copy,Icon])=><div key={label as string} className="rounded-2xl border border-[#e4e6dc] bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[#687365]">{label as string}</span><Icon size={16} className="text-[#929b8b]"/></div><p className="mt-4 text-sm font-semibold text-[#586355]">{copy as string}</p></div>)}</div><BlankPanel icon={BriefcaseBusiness} title="No deals yet" description="Deals you create will appear here, ready to follow from first conversation to next step." /></div>;
}

function TasksPage() {
  return <div className="page-enter"><PageHeading eyebrow="Follow-through" title="Tasks" description="Small promises, remembered. Keep your next customer follow-up close." action={<Button disabled title="Task creation is not available yet"><Plus size={16} />Add task</Button>} /><div className="mt-7 flex flex-wrap gap-2">{['All tasks','Upcoming','Completed'].map((filter,i)=><button disabled key={filter} className={`rounded-lg px-3 py-2 text-xs font-semibold ${i===0?'bg-[#e9efdf] text-[#516044]':'bg-white text-[#8b9287] border border-[#e4e6dc]'} disabled:cursor-not-allowed`}>{filter}</button>)}</div><BlankPanel icon={ListTodo} title="Nothing to follow up on yet" description="Tasks help you remember the next useful move with a customer. They’ll show here when you have some." /></div>;
}

function AssistantPage() {
  return <div className="page-enter"><PageHeading eyebrow="Nexora assistant" title="A little help, soon." description="The assistant is not available yet. Your customer workspace works without it." /><div className="mt-8 overflow-hidden rounded-[24px] border border-[#e3e5dc] bg-white"><div className="flex items-center gap-3 border-b border-[#e9ebe3] px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#202822] text-[#c8f05b]"><Sparkles size={17}/></span><div><p className="text-sm font-bold">Nexora assistant</p><p className="mt-0.5 text-[10px] text-[#91988d]">Unavailable</p></div><span className="ml-auto rounded-full bg-[#f1f1eb] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#8a9086]">Coming later</span></div><div className="grid min-h-[300px] place-items-center px-6 py-12 text-center"><div className="max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-[#f0f3e8] text-[#788768]"><MessageCircleMore size={23}/></span><h2 className="display-font mt-5 text-xl font-semibold tracking-[-.035em]">Not quite ready to help out.</h2><p className="mt-2 text-sm leading-6 text-[#7b8378]">The future assistant is unavailable right now. We’ll make it clear when it’s ready; nothing here is pretending to be live.</p></div></div></div></div>;
}

function SettingsPage() {
  const auth = useAuth();
  return <div className="page-enter"><PageHeading eyebrow="Preferences" title="Settings" description="Your account and workspace at a glance." /><section className="mt-8 max-w-2xl overflow-hidden rounded-[22px] border border-[#e3e5dc] bg-white"><div className="border-b border-[#eceee7] px-5 py-4"><h2 className="text-sm font-bold">Your account</h2></div><div className="divide-y divide-[#eff0eb] px-5"><div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-[#858d80]">Email</span><span className="text-sm font-semibold text-[#394338]" data-testid="text-account-email">{auth.session?.user.email}</span></div><div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-[#858d80]">Workspace</span><span className="text-sm font-semibold text-[#394338]" data-testid="text-workspace-name">{auth.workspace?.name}</span></div><div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-[#858d80]">Your role</span><span className="text-sm font-semibold capitalize text-[#394338]">{auth.workspace?.role}</span></div></div><div className="border-t border-[#eceee7] bg-[#fbfbf7] px-5 py-4"><p className="text-xs leading-5 text-[#858d80]">Workspace membership and access are managed by your workspace owner.</p></div></section>
    <section className="mt-5 max-w-2xl rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:p-6" aria-labelledby="billing-heading" data-testid="section-billing">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f0f1e9] text-[#70796b]"><LockKeyhole size={17} /></span>
        <div><h2 id="billing-heading" className="text-sm font-bold text-[#394338]">Billing</h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[#778073]">Subscription management and payment processing are not available yet. No payment service is connected.</p>
          <span className="mt-4 inline-flex rounded-full bg-[#f2f3ed] px-3 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#858c80]">Not available yet</span>
        </div>
      </div>
    </section>
  </div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function CrmRouteGate({ kind, id }: { kind: 'contacts' | 'companies'; id?: string }) {
  const auth = useAuth();
  if (!auth.client || !auth.workspace?.workspace_id) return <LoadingScreen label="Opening your CRM" />;
  return <CrmRoute client={auth.client} workspaceId={auth.workspace.workspace_id} role={auth.workspace.role} kind={kind} id={id} />;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Landing} />
    <Route path="/login">{() => <AuthPage mode="login" />}</Route>
    <Route path="/signup">{() => <AuthPage mode="signup" />}</Route>
    <Route path="/onboarding">{() => <AuthShell><Onboarding /></AuthShell>}</Route>
    <Route path="/app/today">{() => <AuthShell><TodayPage /></AuthShell>}</Route>
    <Route path="/app/contacts">{() => <AuthShell><CrmRouteGate kind="contacts" /></AuthShell>}</Route>
    <Route path="/app/contacts/:id">{params => <AuthShell><CrmRouteGate key={params.id} kind="contacts" id={params.id} /></AuthShell>}</Route>
    <Route path="/app/companies">{() => <AuthShell><CrmRouteGate kind="companies" /></AuthShell>}</Route>
    <Route path="/app/deals">{() => <AuthShell><DealsPage /></AuthShell>}</Route>
    <Route path="/app/tasks">{() => <AuthShell><TasksPage /></AuthShell>}</Route>
    <Route path="/app/assistant">{() => <AuthShell><AssistantPage /></AuthShell>}</Route>
    <Route path="/app/settings">{() => <AuthShell><SettingsPage /></AuthShell>}</Route>
    <Route>{() => <NotFoundPage />}</Route>
  </Switch></RoutedErrorBoundary>;
}

function NotFoundPage() {
  return <div className="grid min-h-[100dvh] place-items-center bg-[#f7f7f1] px-5 text-center"><div><Brand /><p className="mt-10 text-xs font-bold uppercase tracking-[.16em] text-[#8b9482]">404 / Not here</p><h1 className="display-font mt-3 text-4xl font-semibold tracking-[-.06em]">This page wandered off.</h1><p className="mt-3 text-sm text-[#778073]">The page you’re looking for doesn’t exist.</p><Link href="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-sm font-bold">Back to home <ArrowRight size={15}/></Link></div></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AuthProvider><Router /></AuthProvider></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
