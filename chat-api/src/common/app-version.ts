/** True when `version` ("1.4.0") is older than `minimum` ("1.5.0"). A malformed version counts as older. */
export function isOlderVersion(version: string, minimum: string): boolean {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const have = parse(version);
  const need = parse(minimum);
  if (!need) return false;
  if (!have) return true;
  for (let i = 0; i < 3; i += 1) {
    if (have[i] !== need[i]) return have[i] < need[i];
  }
  return false;
}
