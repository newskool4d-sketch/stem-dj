const STEM_NAMES = ["vocals", "drums", "bass", "other"];

function stemCount(stems = {}) {
  return STEM_NAMES.filter((name) => stems[name]).length;
}

export function stemReadinessLabel(state = {}) {
  if (!state.ready) return "Stems not ready";
  return `Stems ready (${stemCount(state.stems)}/${STEM_NAMES.length})`;
}

export function formatStemJobStatus(state = {}) {
  const status = state.status || "unknown";
  switch (status) {
    case "queued":
      return state.message || "Stem job queued";
    case "running":
      return state.message || "Stem job running";
    case "done":
      return state.message || `Stem job complete (${stemCount(state.stems)}/${STEM_NAMES.length})`;
    case "error":
      return state.message || "Stem job failed";
    case "missing":
      return state.message || "Stem job missing";
    default:
      return state.message || `Stem job ${status}`;
  }
}
