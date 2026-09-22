import type { RepairPersonCandidate, RepairRequest } from "../domain/patch";

export type OutreachMessage = {
  subject: string;
  text: string;
};

export function composeRepairOutreach(
  repair: RepairRequest,
  candidate: RepairPersonCandidate,
): OutreachMessage {
  const area = repair.area.trim();
  const locationLine = area ? `Someone in ${area} needs help with this repair:` : "Someone nearby needs help with this repair:";

  return {
    subject: "Quick repair availability check",
    text: [
      `Hi ${candidate.name},`,
      "",
      locationLine,
      repair.description.trim(),
      "",
      "Are you available today or tomorrow?",
      "",
      "If so, please reply with when you could come and roughly what you'd charge.",
      "",
      "Thanks,",
      "Patch",
    ].join("\n"),
  };
}
