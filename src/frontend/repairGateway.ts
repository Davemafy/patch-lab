import type {
  RepairPersonCandidate,
  RepairReply,
  RepairRequest,
} from "../domain/patch";

export type CreateRepairInput = {
  description: string;
  area: string;
  photoUrl?: string;
};

export type ReplyListener = (reply: RepairReply) => void;

export type RepairSnapshot = {
  repair: RepairRequest;
  candidates: RepairPersonCandidate[];
  replies: RepairReply[];
  chosenId: string | null;
};

export type RepairGateway = {
  mode: "preview" | "live";
  loadRepair?(repairId: string): Promise<RepairSnapshot | null>;
  createRepair(input: CreateRepairInput): Promise<RepairRequest>;
  findCandidates(repair: RepairRequest): Promise<RepairPersonCandidate[]>;
  askForPriceAndTime(
    repair: RepairRequest,
    candidates: RepairPersonCandidate[],
  ): Promise<void>;
  watchReplies(
    repair: RepairRequest,
    candidates: RepairPersonCandidate[],
    onReply: ReplyListener,
  ): () => void;
  choosePerson(repair: RepairRequest, personId: string): Promise<void>;
};

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const previewCandidates = (repairId: string): RepairPersonCandidate[] => [
  {
    id: "tunde-repairs",
    repairId,
    name: "Tunde Repairs",
    website: "tunderepairs.example",
    email: "hello@tunderepairs.example",
    serviceEvidence: "Door handles, locks and stuck-door repairs are listed on their website.",
    sourceUrl: "https://example.com/",
  },
  {
    id: "quickfix-home",
    repairId,
    name: "QuickFix Home Services",
    website: "quickfix.example",
    email: "bookings@quickfix.example",
    serviceEvidence: "Their repair page lists door hardware and lock replacement.",
    sourceUrl: "https://example.com/",
  },
  {
    id: "northside-maintenance",
    repairId,
    name: "Northside Maintenance",
    website: "northside.example",
    serviceEvidence: "General home maintenance includes doors, hinges and handles.",
    sourceUrl: "https://example.com/",
  },
];

const previewReplies = (repairId: string): RepairReply[] => [
  {
    id: "reply-tunde",
    repairId,
    personId: "tunde-repairs",
    rawText: "Hi, yes. I can come today at around 2 PM. It will be ₦12,000 including the replacement handle if needed.",
    canTakeJob: true,
    arrivalText: "Today, around 2 PM",
    priceAmount: 12000,
    currency: "NGN",
    note: "Includes the replacement handle if needed.",
    receivedAt: Date.now() + 1600,
  },
  {
    id: "reply-quickfix",
    repairId,
    personId: "quickfix-home",
    rawText: "We can likely take a look later today, probably after 5. Send the exact address and we can confirm. I can't quote until we see the handle.",
    canTakeJob: null,
    arrivalText: "Later today, probably after 5 PM",
    priceAmount: null,
    currency: null,
    note: "They want the exact address before confirming and did not quote a price.",
    receivedAt: Date.now() + 3600,
  },
];

export const previewRepairGateway: RepairGateway = {
  mode: "preview",

  async createRepair(input) {
    await pause(250);
    return {
      id: makeId("repair"),
      description: input.description,
      area: input.area,
      photoUrl: input.photoUrl,
      status: "reported",
      createdAt: Date.now(),
    };
  },

  async findCandidates(repair) {
    await pause(1250);
    return previewCandidates(repair.id);
  },

  async askForPriceAndTime() {
    await pause(350);
  },

  watchReplies(repair, candidates, onReply) {
    const contactableIds = new Set(
      candidates.filter((candidate) => candidate.email).map((candidate) => candidate.id),
    );
    const timers = previewReplies(repair.id)
      .filter((reply) => contactableIds.has(reply.personId))
      .map((reply, index) =>
        window.setTimeout(() => onReply(reply), index === 0 ? 1450 : 3300),
      );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  },

  async choosePerson() {
    await pause(250);
  },
};
