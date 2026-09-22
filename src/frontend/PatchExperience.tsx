import { useEffect, useMemo, useRef, useState } from "react";
import type {
  RepairPersonCandidate,
  RepairReply,
  RepairRequest,
} from "../domain/patch";
import {
  previewRepairGateway,
  type RepairGateway,
} from "./repairGateway";

type Screen =
  | "home"
  | "report"
  | "looking"
  | "people"
  | "waiting"
  | "replies"
  | "done"
  | "empty"
  | "error";

type AppProps = {
  gateway?: RepairGateway;
};

const money = (amount: number | null, currency: string | null) => {
  if (amount === null) return null;
  if (currency === "NGN") return `₦${amount.toLocaleString("en-NG")}`;
  return `${currency ?? ""} ${amount.toLocaleString()}`.trim();
};

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="button-icon">
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="back-icon">
      <path d="m11.5 5-5 5 5 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="check-icon">
      <path d="m6.5 12.5 3.3 3.3 7.7-8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function Shell({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <main className={`app-shell${compact ? " app-shell--compact" : ""}`}>
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => window.location.reload()} aria-label="Patch home">
          Patch
        </button>
        <span className="topbar-note">Home repair, minus the runaround.</span>
      </header>
      {children}
      <footer className="footer">You choose who takes the job.</footer>
    </main>
  );
}

function PreviewNotice() {
  return (
    <div className="preview-notice" role="note">
      <strong>Preview</strong>
      <span>Sample people and replies are shown until the live service is connected.</span>
    </div>
  );
}

function SourceLink({ candidate }: { candidate: RepairPersonCandidate }) {
  return (
    <a className="source-link" href={candidate.sourceUrl} target="_blank" rel="noreferrer">
      See website source
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function PersonEvidence({ candidate }: { candidate: RepairPersonCandidate }) {
  return (
    <article className="person-row">
      <div className="person-row__index" aria-hidden="true">
        {candidate.name.slice(0, 1)}
      </div>
      <div className="person-row__body">
        <div className="person-row__heading">
          <div>
            <h3>{candidate.name}</h3>
            <p className="website">{candidate.website}</p>
          </div>
          {!candidate.email ? <span className="plain-status">No email found</span> : null}
        </div>
        <p className="evidence">{candidate.serviceEvidence}</p>
        <SourceLink candidate={candidate} />
      </div>
    </article>
  );
}

function ReplyCard({
  reply,
  candidate,
  onChoose,
  choosing,
}: {
  reply: RepairReply;
  candidate: RepairPersonCandidate;
  onChoose: () => void;
  choosing: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const price = money(reply.priceAmount, reply.currency);

  return (
    <article className="reply-card">
      <div className="reply-card__topline">
        <div>
          <h3>{candidate.name}</h3>
          <p className="reply-time">Replied just now</p>
        </div>
        {reply.canTakeJob === true ? <span className="answer-yes">Can take it</span> : null}
        {reply.canTakeJob === null ? <span className="answer-unclear">Not confirmed yet</span> : null}
        {reply.canTakeJob === false ? <span className="answer-no">Can’t take it</span> : null}
      </div>

      <div className="reply-facts">
        <div className="reply-fact">
          <span>When</span>
          <strong>{reply.arrivalText ?? "No clear time given"}</strong>
        </div>
        <div className="reply-fact">
          <span>Price</span>
          <strong>{price ?? "No price given"}</strong>
        </div>
      </div>

      {reply.note ? <p className="reply-note">{reply.note}</p> : null}

      <div className="reply-actions">
        {reply.canTakeJob === true ? (
          <button className="choose-button" type="button" onClick={onChoose} disabled={choosing}>
            {choosing ? "Choosing…" : `Choose ${candidate.name.split(" ")[0]}`}
            <ArrowIcon />
          </button>
        ) : null}
        <button className="text-button" type="button" onClick={() => setShowOriginal((current) => !current)}>
          {showOriginal ? "Hide original reply" : "Read original reply"}
        </button>
      </div>

      {showOriginal ? <blockquote className="original-reply">{reply.rawText}</blockquote> : null}
    </article>
  );
}

export default function PatchExperience({ gateway = previewRepairGateway }: AppProps) {
  const [screen, setScreen] = useState<Screen>("home");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [photoName, setPhotoName] = useState<string | undefined>();
  const [repair, setRepair] = useState<RepairRequest | null>(null);
  const [candidates, setCandidates] = useState<RepairPersonCandidate[]>([]);
  const [replies, setReplies] = useState<RepairReply[]>([]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stopWatchingRef = useRef<(() => void) | null>(null);

  const contactableCandidates = useMemo(
    () => candidates.filter((candidate) => candidate.email),
    [candidates],
  );

  const pendingCandidates = useMemo(() => {
    const repliedIds = new Set(replies.map((reply) => reply.personId));
    return contactableCandidates.filter((candidate) => !repliedIds.has(candidate.id));
  }, [contactableCandidates, replies]);

  const chosenCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === chosenId) ?? null,
    [candidates, chosenId],
  );

  const chosenReply = useMemo(
    () => replies.find((reply) => reply.personId === chosenId) ?? null,
    [replies, chosenId],
  );

  useEffect(() => {
    return () => {
      stopWatchingRef.current?.();
      if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const reset = () => {
    stopWatchingRef.current?.();
    stopWatchingRef.current = null;
    if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
    setDescription("");
    setArea("");
    setPhotoUrl(undefined);
    setPhotoName(undefined);
    setRepair(null);
    setCandidates([]);
    setReplies([]);
    setChosenId(null);
    setChoosingId(null);
    setErrorMessage(null);
    setScreen("home");
  };

  const reportRepair = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim() || !area.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const nextRepair = await gateway.createRepair({
        description: description.trim(),
        area: area.trim(),
        photoUrl,
      });
      setRepair({ ...nextRepair, status: "looking" });
      setScreen("looking");
      setSubmitting(false);

      const found = await gateway.findCandidates(nextRepair);
      setCandidates(found);
      setRepair((current) => (current ? { ...current, status: found.length ? "reported" : "looking" } : current));
      setScreen(found.length ? "people" : "empty");
    } catch (error) {
      setSubmitting(false);
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong while looking for repair people.");
      setScreen("error");
    }
  };

  const askCandidates = async () => {
    if (!repair || contactableCandidates.length === 0) return;

    setErrorMessage(null);
    try {
      await gateway.askForPriceAndTime(repair, contactableCandidates);
      setRepair({ ...repair, status: "waiting" });
      setReplies([]);
      setScreen("waiting");

      stopWatchingRef.current?.();
      stopWatchingRef.current = gateway.watchReplies(repair, contactableCandidates, (reply) => {
        setReplies((current) => {
          if (current.some((item) => item.id === reply.id)) return current;
          return [...current, reply];
        });
        setScreen("replies");
        setRepair((current) => (current ? { ...current, status: "options_ready" } : current));
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't send the requests just now.");
      setScreen("error");
    }
  };

  const choosePerson = async (personId: string) => {
    if (!repair) return;
    setChoosingId(personId);
    setErrorMessage(null);
    try {
      await gateway.choosePerson(repair, personId);
      stopWatchingRef.current?.();
      stopWatchingRef.current = null;
      setChosenId(personId);
      setRepair({ ...repair, status: "chosen" });
      setScreen("done");
    } catch (error) {
      setChoosingId(null);
      setErrorMessage(error instanceof Error ? error.message : "We couldn't save your choice.");
    }
  };

  if (screen === "home") {
    return (
      <Shell>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">For the small things that suddenly become big things.</p>
            <h1>Something broke?</h1>
            <p className="lede">Tell Patch what happened. We’ll find people who handle it and get real prices and times back for you.</p>
            <button className="primary-button" type="button" onClick={() => setScreen("report")}>
              Tell Patch what broke
              <ArrowIcon />
            </button>
          </div>
          <aside className="hero-example" aria-label="Example repair outcome">
            <span className="hero-example__label">What comes back</span>
            <p className="hero-example__problem">“The bedroom door handle turns, but the door won’t open properly.”</p>
            <div className="hero-example__result">
              <span className="avatar">T</span>
              <div>
                <strong>Tunde can come today at 2 PM.</strong>
                <span>₦12,000</span>
              </div>
            </div>
            <p className="hero-example__foot">No calls. No guessing at availability.</p>
          </aside>
        </section>
      </Shell>
    );
  }

  if (screen === "report") {
    return (
      <Shell compact>
        <section className="flow-panel report-panel">
          <button className="back-button" type="button" onClick={() => setScreen("home")}>
            <BackIcon /> Back
          </button>
          <div className="section-heading">
            <p className="step-label">Tell us what happened</p>
            <h1 className="flow-title">What broke?</h1>
            <p>Describe it the way you would to a neighbour. Short is fine.</p>
          </div>

          <form className="report-form" onSubmit={reportRepair}>
            <label className="field">
              <span>What’s wrong?</span>
              <textarea
                value={description}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
                placeholder="The bedroom doorknob turns but the door won’t open properly."
                rows={5}
                maxLength={800}
                autoFocus
              />
              <small>{description.length}/800</small>
            </label>

            <label className="field">
              <span>What area are you in?</span>
              <input
                value={area}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setArea(event.target.value)}
                placeholder="e.g. Wuse 2, Abuja"
                autoComplete="address-level2"
              />
            </label>

            <label className="photo-field">
              <input
                type="file"
                accept="image/*"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (photoUrl?.startsWith("blob:")) URL.revokeObjectURL(photoUrl);
                  setPhotoUrl(URL.createObjectURL(file));
                  setPhotoName(file.name);
                }}
              />
              <span className="photo-field__icon" aria-hidden="true">＋</span>
              <span>
                <strong>{photoName ?? "Add a photo"}</strong>
                <small>{photoName ? "Photo added" : "Optional, but useful for visible damage"}</small>
              </span>
            </label>

            <button className="primary-button primary-button--wide" type="submit" disabled={!description.trim() || !area.trim() || submitting}>
              {submitting ? "Starting…" : "Find people who can fix it"}
              {!submitting ? <ArrowIcon /> : null}
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  if (screen === "looking") {
    return (
      <Shell compact>
        <section className="flow-panel looking-panel" aria-live="polite">
          {gateway.mode === "preview" ? <PreviewNotice /> : null}
          <div className="search-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="step-label">Looking now</p>
          <h1 className="flow-title">Finding people who handle this kind of repair.</h1>
          <p className="flow-copy">We’re checking public service pages for a genuine match to what you described in {repair?.area}.</p>
          <div className="repair-summary">
            <span>Your repair</span>
            <p>{repair?.description}</p>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "people") {
    return (
      <Shell compact>
        <section className="flow-panel">
          {gateway.mode === "preview" ? <PreviewNotice /> : null}
          <div className="section-heading section-heading--row">
            <div>
              <p className="step-label">People found</p>
              <h1 className="flow-title">These people say they handle it.</h1>
              <p>That doesn’t mean they’re free today. We’ll ask them next.</p>
            </div>
            <span className="count-mark">{candidates.length}</span>
          </div>

          <div className="people-list">
            {candidates.map((candidate) => <PersonEvidence key={candidate.id} candidate={candidate} />)}
          </div>

          <div className="sticky-action">
            <div>
              <strong>{contactableCandidates.length} {contactableCandidates.length === 1 ? "person" : "people"} can be contacted</strong>
              <span>We’ll ask for price and time. Nothing is booked yet.</span>
            </div>
            <button className="primary-button" type="button" onClick={askCandidates} disabled={contactableCandidates.length === 0}>
              Ask for price and time
              <ArrowIcon />
            </button>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "waiting" || screen === "replies") {
    const asked = contactableCandidates.length;
    const replyCount = replies.length;
    const heading = replyCount === 0
      ? `We’ve asked ${asked} ${asked === 1 ? "person" : "people"}.`
      : replyCount === 1
        ? "One reply is in."
        : `${replyCount} replies are in.`;

    return (
      <Shell compact>
        <section className="flow-panel" aria-live="polite">
          {gateway.mode === "preview" ? <PreviewNotice /> : null}
          <div className="section-heading">
            <p className="step-label">{replyCount === 0 ? "Waiting for replies" : "Your options"}</p>
            <h1 className="flow-title">{heading}</h1>
            <p>{replyCount === 0 ? "You can leave this page open. Replies will appear here as they arrive." : "You can choose now, or wait for the others to reply."}</p>
          </div>

          {replies.length > 0 ? (
            <div className="reply-list">
              {replies.map((reply) => {
                const candidate = candidates.find((item) => item.id === reply.personId);
                if (!candidate) return null;
                return (
                  <ReplyCard
                    key={reply.id}
                    reply={reply}
                    candidate={candidate}
                    onChoose={() => choosePerson(candidate.id)}
                    choosing={choosingId === candidate.id}
                  />
                );
              })}
            </div>
          ) : null}

          {pendingCandidates.length > 0 ? (
            <div className="pending-list">
              {pendingCandidates.map((candidate) => (
                <div className="pending-row" key={candidate.id}>
                  <span className="pending-dot" aria-hidden="true" />
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>Waiting for a reply</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </Shell>
    );
  }

  if (screen === "done" && chosenCandidate && chosenReply) {
    const chosenPrice = money(chosenReply.priceAmount, chosenReply.currency);
    return (
      <Shell compact>
        <section className="flow-panel done-panel">
          <div className="done-mark"><CheckIcon /></div>
          <p className="step-label">You chose {chosenCandidate.name}</p>
          <h1 className="flow-title">{chosenReply.arrivalText ? `${chosenCandidate.name.split(" ")[0]} is coming ${chosenReply.arrivalText.toLowerCase()}.` : `${chosenCandidate.name.split(" ")[0]} is your choice.`}</h1>
          {chosenPrice ? <p className="done-price">{chosenPrice}</p> : null}
          <p className="flow-copy">We’ve saved your choice. Keep the original reply handy for the details they gave you.</p>
          <blockquote className="done-reply">{chosenReply.rawText}</blockquote>
          <button className="secondary-button" type="button" onClick={reset}>Start another repair</button>
        </section>
      </Shell>
    );
  }

  if (screen === "empty") {
    return (
      <Shell compact>
        <section className="flow-panel empty-panel">
          <p className="step-label">No good matches yet</p>
          <h1 className="flow-title">We couldn’t find someone we can confidently point you to.</h1>
          <p className="flow-copy">Try widening the area or adding a little more detail about what broke. We’d rather show nobody than pretend we found the right person.</p>
          <button className="secondary-button" type="button" onClick={() => setScreen("report")}>Edit your repair</button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell compact>
      <section className="flow-panel empty-panel">
        <p className="step-label">Something got in the way</p>
        <h1 className="flow-title">We couldn’t keep this repair moving.</h1>
        <p className="flow-copy">{errorMessage ?? "Try again. Your repair description is still here."}</p>
        <button className="secondary-button" type="button" onClick={() => setScreen(repair ? "people" : "report")}>Try again</button>
      </section>
    </Shell>
  );
}
