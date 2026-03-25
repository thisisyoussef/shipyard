import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TargetProfile } from "../../artifacts/types.js";
import { ensureShipyardDirectories, getShipyardDirectory } from "../../engine/state.js";

function getTargetProfilePath(targetDirectory: string): string {
  return path.join(getShipyardDirectory(targetDirectory), "profile.json");
}

export async function saveTargetProfile(
  targetDirectory: string,
  profile: TargetProfile,
): Promise<string> {
  await ensureShipyardDirectories(targetDirectory);
  const profilePath = getTargetProfilePath(targetDirectory);
  await writeFile(profilePath, JSON.stringify(profile, null, 2), "utf8");
  return profilePath;
}

export async function loadTargetProfile(
  targetDirectory: string,
): Promise<TargetProfile | null> {
  const profilePath = getTargetProfilePath(targetDirectory);

  try {
    await access(profilePath);
  } catch {
    return null;
  }

  const contents = await readFile(profilePath, "utf8");
  return JSON.parse(contents) as TargetProfile;
}
