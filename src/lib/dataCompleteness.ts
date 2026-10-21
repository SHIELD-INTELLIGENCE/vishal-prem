export interface CappedRead {
  label: string
  loaded: number
  cap: number
}

export function isCapped(loaded: number, cap: number): boolean {
  return loaded > cap
}

export function capLabels(reads: CappedRead[]): string[] {
  return reads.filter((read) => isCapped(read.loaded, read.cap)).map((read) => read.label)
}
