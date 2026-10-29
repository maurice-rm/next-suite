/** Orders names by code unit, so the output is the same on every machine whatever its locale. */
export const compareNames = (first: string, second: string): number => {
  if (first === second) {
    return 0
  }
  return first < second ? -1 : 1
}
