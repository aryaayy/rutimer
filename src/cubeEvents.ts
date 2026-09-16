export const WCA_EVENTS = [
  { name: '2x2', scrambleId: '222', puzzleId: '2x2x2' },
  { name: '3x3', scrambleId: '333', puzzleId: '3x3x3' },
  { name: '4x4', scrambleId: '444', puzzleId: '4x4x4' },
  { name: '5x5', scrambleId: '555', puzzleId: '5x5x5' },
  { name: '6x6', scrambleId: '666', puzzleId: '6x6x6' },
  { name: '7x7', scrambleId: '777', puzzleId: '7x7x7' },
  { name: '3x3 OH', scrambleId: '333oh', puzzleId: '3x3x3' },
  { name: '3x3 BLD', scrambleId: '333bf', puzzleId: '3x3x3' },
  { name: '4x4 BLD', scrambleId: '444bf', puzzleId: '4x4x4' },
  { name: '5x5 BLD', scrambleId: '555bf', puzzleId: '5x5x5' },
  { name: '3x3 FMC', scrambleId: '333fm', puzzleId: '3x3x3' },
  { name: '3x3 MBLD', scrambleId: '333mbf', puzzleId: '3x3x3' },
  { name: 'Clock', scrambleId: 'clock', puzzleId: 'clock' },
  { name: 'Megaminx', scrambleId: 'minx', puzzleId: 'megaminx' },
  { name: 'Pyraminx', scrambleId: 'pyram', puzzleId: 'pyraminx' },
  { name: 'Skewb', scrambleId: 'skewb', puzzleId: 'skewb' },
  { name: 'Square-1', scrambleId: 'sq1', puzzleId: 'square1' }
] as const

export type CubeEventName = typeof WCA_EVENTS[number]['name']

export const DEFAULT_CUBE_EVENT: CubeEventName = '3x3'

export const getCubeEvent = (name: string) => {
  return WCA_EVENTS.find(event => event.name === name) || WCA_EVENTS[1]
}
