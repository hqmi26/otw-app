interface StepLike {
  name: string;
  ref?: string;
  maneuver: { type: string; modifier?: string; exit?: number };
}

/** Turns an OSRM step into a short spoken/written instruction. */
export function describeStep(step: StepLike): string {
  const { type, modifier, exit } = step.maneuver;
  const road = step.name || step.ref || '';
  const onto = road ? ` onto ${road}` : '';
  const dir = modifier ?? '';

  switch (type) {
    case 'depart':
      return road ? `Head out on ${road}` : 'Head out';
    case 'arrive':
      return 'You have arrived';
    case 'merge':
      return `Merge${onto}`;
    case 'on ramp':
      return `Take the ramp${dir ? ` on the ${dir.replace('slight ', '')}` : ''}${onto}`;
    case 'off ramp':
      return `Take the exit${dir ? ` on the ${dir.replace('slight ', '')}` : ''}${onto}`;
    case 'fork':
      return `Keep ${dir.includes('left') ? 'left' : 'right'} at the fork${onto}`;
    case 'roundabout':
    case 'rotary':
      return exit ? `At the roundabout, take exit ${exit}${onto}` : `Go through the roundabout${onto}`;
    case 'roundabout turn':
    case 'turn':
    case 'end of road':
      if (dir === 'uturn') return `Make a U-turn${onto}`;
      if (dir === 'straight') return `Go straight${onto}`;
      return `Turn ${dir}${onto}`;
    case 'new name':
    case 'continue':
      if (dir && dir !== 'straight') return `Keep ${dir.includes('left') ? 'left' : 'right'}${onto}`;
      return road ? `Continue on ${road}` : 'Continue straight';
    default:
      return road ? `Continue on ${road}` : 'Continue';
  }
}

/** Rotation for a straight-up arrow icon, by OSRM modifier. */
export function arrowRotation(modifier?: string): number {
  switch (modifier) {
    case 'slight right':
      return 40;
    case 'right':
      return 90;
    case 'sharp right':
      return 135;
    case 'uturn':
      return 180;
    case 'sharp left':
      return -135;
    case 'left':
      return -90;
    case 'slight left':
      return -40;
    default:
      return 0;
  }
}
