export function durationLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes
    ? `${minutes} min${remainder ? ` ${remainder} s` : ''}`
    : `${seconds} s`
}
