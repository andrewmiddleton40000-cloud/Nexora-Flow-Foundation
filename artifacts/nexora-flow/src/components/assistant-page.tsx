import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Copy,
  LoaderCircle,
  Mail,
  MessageCircleMore,
  Sparkles,
} from "lucide-react";
import { listContacts } from "@/lib/crm-data";
import type { CrmContact } from "@/lib/crm-types";

type Action = "summary" | "email_draft" | "next_steps";
type Usage = {
  configured: boolean;
  plan: "free" | "growth" | "pro";
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  resetsAt: string;
};
type AssistantResult = {
  action: Action;
  content: string;
  contactName: string;
  contactEmail: string | null;
  usage: Usage;
};
type ApiErrorBody = { code?: string; message?: string };
type Props = {
  client: SupabaseClient;
  workspaceId: string;
  accessToken: string;
};

const basePath = import.meta.env.BASE_URL;
const actions: { value: Action; title: string; description: string }[] = [
  {
    value: "summary",
    title: "Customer summary",
    description: "Pull together recorded context, open work, and recent activity.",
  },
  {
    value: "email_draft",
    title: "Follow-up email",
    description: "Write a reviewable draft using only the selected customer’s record.",
  },
  {
    value: "next_steps",
    title: "Next-step ideas",
    description: "Get a short, prioritized list grounded in current CRM details.",
  },
];

function displayError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The assistant could not complete that request. Please try again.";
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & ApiErrorBody)
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.message || "The assistant could not complete that request.",
    );
  }
  if (!payload) throw new Error("The assistant returned an empty response.");
  return payload;
}

function PageHeading() {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#839078]">
        Nexora assistant
      </p>
      <h1 className="display-font mt-2 text-[34px] font-semibold leading-tight tracking-[-.06em] text-[#273128] sm:text-[42px]">
        A clearer next step.
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#778073]">
        Work from the customer information already in your workspace—no invented
        history, and no changes made on your behalf.
      </p>
    </div>
  );
}

export function AssistantPage({ client, workspaceId, accessToken }: Props) {
  const queryClient = useQueryClient();
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [action, setAction] = useState<Action>("summary");
  const [guidance, setGuidance] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [draft, setDraft] = useState("");
  const [copyNotice, setCopyNotice] = useState("");

  const usageQuery = useQuery({
    queryKey: ["assistant-usage", workspaceId],
    queryFn: async () => {
      const url = `${basePath}api/assistant/usage?workspaceId=${encodeURIComponent(workspaceId)}`;
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      return readJson<Usage>(response);
    },
    enabled: !!workspaceId && !!accessToken,
    staleTime: 15_000,
    retry: 1,
  });

  const contactsQuery = useQuery({
    queryKey: ["assistant-contacts", workspaceId, contactSearch],
    queryFn: () =>
      listContacts(client, workspaceId, {
        search: contactSearch.trim(),
        pageSize: 100,
      }),
    enabled: !!workspaceId,
    staleTime: 20_000,
  });
  const contacts = contactsQuery.data?.items ?? [];

  const generate = useMutation({
    mutationFn: async (requestedAction: Action) => {
      if (!selectedContact) throw new Error("Choose a contact first.");
      const response = await fetch(`${basePath}api/assistant/generate`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          contactId: selectedContact.id,
          action: requestedAction,
          ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
        }),
      });
      return readJson<AssistantResult>(response);
    },
    onSuccess: async (generated) => {
      setResult(generated);
      setDraft(generated.content);
      setCopyNotice("");
      await queryClient.invalidateQueries({
        queryKey: ["assistant-usage", workspaceId],
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["assistant-usage", workspaceId],
      });
    },
  });

  const canGenerate =
    !!selectedContact &&
    !!accessToken &&
    usageQuery.data?.configured === true &&
    usageQuery.data.remaining > 0 &&
    !generate.isPending;

  const resetAt = useMemo(() => {
    const date = usageQuery.data?.resetsAt;
    if (!date) return "";
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }).format(new Date(date));
  }, [usageQuery.data?.resetsAt]);

  const chooseContact = (contactId: string) => {
    setSelectedContact(contacts.find((contact) => contact.id === contactId) ?? null);
    setResult(null);
    setDraft("");
    setCopyNotice("");
  };

  const runAction = (requestedAction: Action) => {
    setAction(requestedAction);
    setResult(null);
    setDraft("");
    setCopyNotice("");
    generate.mutate(requestedAction);
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopyNotice("Draft copied. Review it before sending.");
    } catch {
      setCopyNotice("Copying is unavailable here. Select the draft text to copy it.");
    }
  };

  const error = usageQuery.error || contactsQuery.error || generate.error;

  return (
    <div className="page-enter">
      <PageHeading />

      <section className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[22px] border border-[#e3e5dc] bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#202822] text-[#c8f05b]">
              <Sparkles size={18} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#354035]">Start with a customer</h2>
              <p className="mt-0.5 text-xs text-[#879083]">
                The assistant can only use a contact you can access.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(180px,.8fr)_minmax(0,1.2fr)]">
            <label className="block text-xs font-bold text-[#566052]">
              Find a contact
              <input
                type="search"
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder="Search your contacts"
                aria-label="Search contacts for the assistant"
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-3.5 text-sm outline-none transition placeholder:text-[#a1a79d] focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20"
              />
            </label>
            <label className="block text-xs font-bold text-[#566052]">
              Customer record
              <select
                value={selectedContact?.id ?? ""}
                onChange={(event) => chooseContact(event.target.value)}
                disabled={contactsQuery.isLoading || contacts.length === 0}
                className="mt-1.5 h-11 w-full rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-3.5 text-sm text-[#303a30] outline-none transition focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20 disabled:opacity-60"
              >
                <option value="">
                  {contactsQuery.isLoading
                    ? "Loading contacts…"
                    : contacts.length
                      ? "Choose a contact"
                      : "No matching contacts"}
                </option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name}
                    {contact.company?.name ? ` · ${contact.company.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {contactsQuery.isError && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-[#efcbc4] bg-[#fff5f2] px-4 py-3 text-sm text-[#98493e]"
            >
              We couldn’t load your contacts. Refresh and try again.
            </p>
          )}
          {!contactsQuery.isLoading && !contactsQuery.isError && contacts.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[#d9ddd2] bg-[#fbfbf7] p-4">
              <p className="text-sm font-semibold text-[#596453]">
                No contacts to use yet
              </p>
              <p className="mt-1 text-xs leading-5 text-[#838c7f]">
                Add a customer record first. The assistant won’t make up customer history.
              </p>
              <Link
                href="/app/contacts"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#596a42]"
              >
                Go to contacts <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {selectedContact && (
            <>
              <label className="mt-5 block text-xs font-bold text-[#566052]">
                Optional guidance
                <textarea
                  value={guidance}
                  onChange={(event) => setGuidance(event.target.value.slice(0, 400))}
                  maxLength={400}
                  rows={2}
                  placeholder={
                    action === "email_draft"
                      ? "What should this follow-up cover?"
                      : "What would you like the assistant to focus on?"
                  }
                  className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-[#dfe2d8] bg-[#fdfdfa] px-3.5 py-3 text-sm text-[#303a30] placeholder:text-[#a1a79d] outline-none transition focus:border-[#9fbf59] focus:ring-4 focus:ring-[#c8f05b]/20"
                />
                <span className="mt-1 block text-right text-[10px] font-normal text-[#939b8f]">
                  {guidance.length}/400
                </span>
              </label>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {actions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={!canGenerate}
                    onClick={() => runAction(item.value)}
                    className={`min-h-[108px] rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                      action === item.value
                        ? "border-[#b8cf87] bg-[#f4f8ea]"
                        : "border-[#e5e8df] bg-[#fdfdfa] hover:border-[#cbd6b7]"
                    }`}
                  >
                    <span className="block text-xs font-bold text-[#465344]">
                      {item.title}
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-5 text-[#7d8679]">
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f8f3] px-4 py-3">
                <p className="text-xs text-[#737d6e]">
                  Selected:{" "}
                  <span className="font-semibold text-[#44503f]">
                    {selectedContact.first_name} {selectedContact.last_name}
                  </span>
                </p>
                <button
                  type="button"
                  disabled={!canGenerate}
                  onClick={() => runAction(action)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#c8f05b] px-4 text-xs font-bold text-[#202822] transition hover:bg-[#b9e548] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {generate.isPending ? (
                    <>
                      <LoaderCircle size={15} className="animate-spin" />
                      Working…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      {actions.find((item) => item.value === action)?.title}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {generate.isError && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-[#efcbc4] bg-[#fff5f2] px-4 py-3 text-sm leading-5 text-[#98493e]"
            >
              {displayError(generate.error)}
            </p>
          )}
          {result && (
            <section
              className="mt-5 rounded-2xl border border-[#dfe4d4] bg-[#fbfcf8] p-4 sm:p-5"
              aria-live="polite"
              aria-label={`${actions.find((item) => item.value === result.action)?.title} result`}
            >
              <div className="flex flex-col gap-3 border-b border-[#e8ebe2] pb-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  {result.action === "email_draft" ? (
                    <Mail size={16} className="shrink-0 text-[#6b7958]" />
                  ) : (
                    <MessageCircleMore size={16} className="shrink-0 text-[#6b7958]" />
                  )}
                  <h2 className="text-sm font-bold text-[#3c4939]">
                    {actions.find((item) => item.value === result.action)?.title}
                  </h2>
                </div>
                {result.action === "email_draft" && (
                  <p className="truncate text-xs text-[#788174] sm:ml-auto">
                    To: {result.contactEmail ?? "No email on file"}
                  </p>
                )}
              </div>
              {result.action === "email_draft" ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={10}
                  aria-label="Editable follow-up email draft"
                  className="mt-4 min-h-60 w-full resize-y rounded-xl border border-[#e4e7de] bg-white px-4 py-3 text-sm leading-6 text-[#4e5a4a] outline-none focus:border-[#a8c66c] focus:ring-4 focus:ring-[#c8f05b]/20"
                />
              ) : (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#4e5a4a]">
                  {result.content}
                </p>
              )}
              {result.action === "email_draft" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void copyDraft()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dfe2d8] bg-white px-3.5 text-xs font-bold text-[#52604d] hover:bg-[#f7f8f2]"
                  >
                    {copyNotice.startsWith("Draft copied") ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    Copy draft
                  </button>
                  {copyNotice && (
                    <span role="status" className="text-xs text-[#6f7a67]">
                      {copyNotice}
                    </span>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-[22px] border border-[#e3e5dc] bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#394338]">Workspace usage</h2>
              <span className="rounded-full bg-[#eef3e5] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#62734f]">
                {usageQuery.data?.plan ?? "—"}
              </span>
            </div>
            {usageQuery.isLoading ? (
              <div className="mt-5 h-12 animate-pulse rounded-xl bg-[#f1f2ec]" />
            ) : usageQuery.data ? (
              <>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="display-font text-3xl font-semibold tracking-[-.05em] text-[#303a30]">
                    {usageQuery.data.dailyUsed}
                  </span>
                  <span className="text-xs text-[#858d80]">
                    of {usageQuery.data.dailyLimit} assistant requests today
                  </span>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0e7]"
                  role="progressbar"
                  aria-label="Daily assistant usage"
                  aria-valuemin={0}
                  aria-valuemax={usageQuery.data.dailyLimit}
                  aria-valuenow={usageQuery.data.dailyUsed}
                >
                  <div
                    className="h-full rounded-full bg-[#9fc943] transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (usageQuery.data.dailyUsed / Math.max(1, usageQuery.data.dailyLimit)) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#838c7f]">
                  <Clock3 size={13} /> Resets at {resetAt}
                </p>
                {!usageQuery.data.configured && (
                  <p className="mt-4 rounded-xl border border-[#e7d7a3] bg-[#fff9e9] p-3 text-xs leading-5 text-[#645630]">
                    Assistant setup is incomplete. Add the server-side AI provider
                    settings before generating content.
                  </p>
                )}
                {usageQuery.data.remaining === 0 && (
                  <p className="mt-4 rounded-xl border border-[#e7d7a3] bg-[#fff9e9] p-3 text-xs leading-5 text-[#645630]">
                    The daily workspace limit has been reached.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 text-xs leading-5 text-[#838c7f]">
                Usage is unavailable until the assistant service is configured.
              </p>
            )}
          </section>

          <section className="rounded-[22px] bg-[#202822] p-5 text-white">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[#c8f05b]">
                <CircleHelp size={16} />
              </span>
              <div>
                <h2 className="text-xs font-bold">You stay in control</h2>
                <p className="mt-2 text-xs leading-5 text-white/65">
                  Only the selected contact and its related CRM context are sent
                  to the configured AI provider. Prompts and replies aren’t saved
                  by Nexora Flow; the provider’s own data handling policies still apply.
                </p>
                <p className="mt-3 text-xs leading-5 text-white/65">
                  Email drafts are never sent automatically. Review them yourself;
                  suggestions don’t change records.
                </p>
              </div>
            </div>
          </section>

          {usageQuery.isError && (
            <p
              role="alert"
              className="rounded-xl border border-[#efcbc4] bg-[#fff5f2] px-4 py-3 text-xs leading-5 text-[#98493e]"
            >
              {displayError(error)}
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}
