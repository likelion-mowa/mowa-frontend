import Svg, { Ellipse, Path } from 'react-native-svg';

/**
 * The MOWA character's face, ported 1:1 from the prototype's inline SVG
 * (`Walklog Mobile App MVP` src/App.tsx — home's detection card at 30px and the
 * archive header's avatar at 26px). Same viewBox and geometry.
 *
 * The hex values below are the illustration's own palette, not UI tokens: they
 * describe the character, so they do not belong in palette.json alongside the
 * colors screens style with.
 */

const FACE = '#8DC63F';
const EYE = '#1a1a1a';
const CHEEK = '#F4A0A0';
const NOSE = '#5a8a20';

type MowaFaceProps = {
  size?: number;
};

export function MowaFace({ size = 30 }: MowaFaceProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Ellipse cx={15} cy={16} rx={12} ry={13} fill={FACE} />

      <Ellipse cx={10.5} cy={13.5} rx={3} ry={3.5} fill={EYE} />
      <Ellipse cx={9.3} cy={12.2} rx={1.1} ry={1.1} fill="white" opacity={0.9} />
      <Ellipse cx={19.5} cy={13.5} rx={3} ry={3.5} fill={EYE} />
      <Ellipse cx={18.3} cy={12.2} rx={1.1} ry={1.1} fill="white" opacity={0.9} />

      <Ellipse cx={7.5} cy={18} rx={2.8} ry={1.6} fill={CHEEK} opacity={0.55} />
      <Ellipse cx={22.5} cy={18} rx={2.8} ry={1.6} fill={CHEEK} opacity={0.55} />

      <Path d="M11.5 20 Q15 23.5 18.5 20" stroke={EYE} strokeWidth={1.3} strokeLinecap="round" fill="none" />
      <Ellipse cx={15} cy={18} rx={0.8} ry={0.6} fill={NOSE} opacity={0.5} />
    </Svg>
  );
}
