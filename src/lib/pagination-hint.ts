export function moreResultsHint(resource: string, before?: string) {
  return before
    ? `There are more ${resource} available. Use the "before" parameter with the first ID to retrieve more.`
    : `There are more ${resource} available. Use the "after" parameter with the last ID to retrieve more.`;
}
