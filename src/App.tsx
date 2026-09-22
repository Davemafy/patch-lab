import PatchExperience from "./frontend/PatchExperience";
import { createLiveRepairGateway } from "./frontend/liveRepairGateway";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const liveGateway = convexUrl ? createLiveRepairGateway(convexUrl) : undefined;

export default function App() {
  return <PatchExperience gateway={liveGateway} />;
}
