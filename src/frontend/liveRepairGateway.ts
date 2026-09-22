import { ConvexReactClient } from "convex/react";
import { anyApi } from "convex/server";
import type { RepairPersonCandidate, RepairReply, RepairRequest } from "../domain/patch";
import type { RepairGateway, RepairSnapshot } from "./repairGateway";

type RepairView = {
  repair: {
    id: string;
    description: string;
    area: string;
    photoUrl: string | null;
    status: RepairRequest["status"];
    createdAt: number;
    chosenCandidateId: string | null;
  };
  candidates: Array<{
    id: string;
    repairId: string;
    name: string;
    website: string;
    email: string | null;
    serviceEvidence: string;
    sourceUrl: string;
    replies: Array<{
      id: string;
      repairId: string;
      personId: string;
      rawText: string;
      canTakeJob: boolean | null;
      arrivalText: string | null;
      priceAmount: number | null;
      currency: string | null;
      note: string | null;
      receivedAt: number;
    }>;
  }>;
  chosenCandidate: { id: string } | null;
};

function snapshotFrom(view: RepairView | null): RepairSnapshot | null {
  if (!view?.repair) return null;
  const repair: RepairRequest = {
    id: String(view.repair.id),
    description: view.repair.description,
    area: view.repair.area,
    ...(view.repair.photoUrl ? { photoUrl: view.repair.photoUrl } : {}),
    status: view.repair.status,
    createdAt: view.repair.createdAt,
  };
  const candidates: RepairPersonCandidate[] = view.candidates.map((candidate) => ({
    id: String(candidate.id),
    repairId: String(candidate.repairId),
    name: candidate.name,
    website: candidate.website,
    ...(candidate.email ? { email: candidate.email } : {}),
    serviceEvidence: candidate.serviceEvidence,
    sourceUrl: candidate.sourceUrl,
  }));
  const replies: RepairReply[] = view.candidates.flatMap((candidate) =>
    candidate.replies.map((reply) => ({
      id: String(reply.id),
      repairId: String(reply.repairId),
      personId: String(reply.personId),
      rawText: reply.rawText,
      canTakeJob: reply.canTakeJob,
      arrivalText: reply.arrivalText,
      priceAmount: reply.priceAmount,
      currency: reply.currency,
      note: reply.note,
      receivedAt: reply.receivedAt,
    })),
  );
  return {
    repair,
    candidates,
    replies: replies.sort((a, b) => a.receivedAt - b.receivedAt),
    chosenId: view.repair.chosenCandidateId ? String(view.repair.chosenCandidateId) : null,
  };
}

export function createLiveRepairGateway(url: string): RepairGateway {
  const client = new ConvexReactClient(url);

  return {
    mode: "live",

    async loadRepair(repairId) {
      const view = await client.query(anyApi.patch.getRepair, { repairId }) as RepairView | null;
      return snapshotFrom(view);
    },

    async createRepair(input) {
      const result = await client.mutation(anyApi.patch.createRepair, {
        description: input.description,
        area: input.area,
        ...(input.photoUrl && !input.photoUrl.startsWith("blob:") ? { photoUrl: input.photoUrl } : {}),
        clientRequestId: crypto.randomUUID(),
      }) as { repairId: string };
      return {
        id: String(result.repairId),
        description: input.description,
        area: input.area,
        status: "reported",
        createdAt: Date.now(),
      };
    },

    async findCandidates(repair) {
      return await client.action(anyApi.discovery.findRepairPeople, {
        repairId: repair.id,
      }) as RepairPersonCandidate[];
    },

    async askForPriceAndTime(_repair, candidates) {
      await client.action(anyApi.mail.askRepairPeople, {
        candidateIds: candidates.map((candidate) => candidate.id),
      });
    },

    watchReplies(repair, _candidates, onReply) {
      const seen = new Set<string>();
      return client.onUpdate(
        anyApi.patch.getRepair,
        { repairId: repair.id },
        (value: unknown) => {
          const snapshot = snapshotFrom(value as RepairView | null);
          if (!snapshot) return;
          for (const reply of snapshot.replies) {
            if (seen.has(reply.id)) continue;
            seen.add(reply.id);
            onReply(reply);
          }
        },
      );
    },

    async choosePerson(repair, personId) {
      await client.mutation(anyApi.patch.chooseRepairPerson, {
        repairId: repair.id,
        candidateId: personId,
      });
    },
  };
}
