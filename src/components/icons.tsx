import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

/**
 * Icons ported 1:1 from the design prototype's inline SVGs
 * (`Walklog Mobile App MVP` src/App.tsx). Same viewBox, paths and stroke
 * weights; only the delivery changed (react-native-svg instead of DOM <svg>).
 *
 * react-native-svg has no `currentColor`, so color is a prop. Stroke set on
 * the root <Svg> is inherited by the children.
 */

type IconProps = {
  size?: number;
  color?: string;
};

function strokeProps(color: string, strokeWidth = 1.8) {
  return {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
}

export function IcWalk({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Circle cx={13} cy={4} r={1.4} />
      <Path d="M10 9.5L8 18l3.5-3 2 5.5 2-5.5 2.5 2.5L16 10" />
      <Path d="M9.5 9.5c.8-1.2 2.4-2 3.8-1.2" />
    </Svg>
  );
}

export function IcCamera({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

export function IcGallery({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Rect x={2} y={2} width={20} height={20} rx={3} />
      <Rect x={6} y={6} width={5} height={5} rx={1} />
      <Rect x={13} y={6} width={5} height={5} rx={1} />
      <Rect x={6} y={13} width={5} height={5} rx={1} />
      <Rect x={13} y={13} width={5} height={5} rx={1} />
    </Svg>
  );
}

export function IcSparkle({ size = 20, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
    </Svg>
  );
}

export function IcLocation({ size = 14, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}

export function IcClock({ size = 14, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

export function IcChevronLeft({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 2)}>
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

export function IcChevronRight({ size = 16, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 2)}>
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

export function IcImage({ size = 32, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 1.5)}>
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

export function IcClose({ size = 16, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 2)}>
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

export function IcUser({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

export function IcDocument({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Polyline points="14 2 14 8 20 8" />
      <Line x1={9} y1={13} x2={15} y2={13} />
      <Line x1={9} y1={17} x2={13} y2={17} />
    </Svg>
  );
}

export function IcHome({ size = 22, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

export function IcGrid({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 2)}>
      <Rect x={3} y={3} width={7} height={7} />
      <Rect x={14} y={3} width={7} height={7} />
      <Rect x={3} y={14} width={7} height={7} />
      <Rect x={14} y={14} width={7} height={7} />
    </Svg>
  );
}

export function IcCalendar({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color, 2)}>
      <Rect x={3} y={4} width={18} height={18} rx={2} />
      <Line x1={16} y1={2} x2={16} y2={6} />
      <Line x1={8} y1={2} x2={8} y2={6} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

export function IcBell({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function IcShield({ size = 18, color = colors.ink }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...strokeProps(color)}>
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}
