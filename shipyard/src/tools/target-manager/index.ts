import "./bootstrap-target.js";
import "./create-target.js";
import "./enrich-target.js";
import "./list-targets.js";
import "./select-target.js";

export {
  bootstrapTargetTool,
  type BootstrapTargetInput,
  type BootstrapTargetResult,
} from "./bootstrap-target.js";
export { createTargetTool, type CreateTargetInput, type CreateTargetResult } from "./create-target.js";
export {
  buildEnrichmentContext,
  buildEnrichmentPrompt,
  configureTargetManagerEnrichmentInvoker,
  enrichTargetTool,
  parseEnrichmentResponse,
  type EnrichTargetInput,
  type EnrichmentContext,
  type EnrichmentProgressEvent,
} from "./enrich-target.js";
export { listTargetsTool, type ListTargetsInput, type TargetListEntry } from "./list-targets.js";
export { loadTargetProfile, saveTargetProfile } from "./profile-io.js";
export {
  deriveTargetNameFromPath,
  materializeScaffold,
  normalizeTargetName,
  type MaterializeScaffoldInput,
  type MaterializeScaffoldResult,
} from "./scaffold-materializer.js";
export { getScaffoldFiles, SCAFFOLD_TYPES, type ScaffoldFile, type ScaffoldType } from "./scaffolds.js";
export { selectTargetTool, type SelectTargetInput, type SelectTargetResult } from "./select-target.js";
