/** Soft-disable: Teams UI/write paths retired; DB rows kept for history. */
export const TEAMS_FEATURE_DISABLED = true;

export const TEAMS_DISABLED_MESSAGE =
  "Teams management is retired. Existing team records are kept for history only.";

export function teamsFeatureDisabledJson() {
  return { message: TEAMS_DISABLED_MESSAGE };
}
