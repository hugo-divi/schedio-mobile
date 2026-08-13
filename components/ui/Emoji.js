import { Image } from 'react-native';

// Fluent Emoji, Color style (Microsoft, MIT-licensed) — Android's system
// emoji (Noto) reads flat and inconsistent next to the rest of the UI, and
// there's no legal way to ship Apple's actual glyphs in the APK. Rasterized
// from the source SVGs at build time; see assets/emoji/.
const SOURCES = {
  fire: require('../../assets/emoji/fire.png'),
  barChart: require('../../assets/emoji/bar-chart.png'),
  relievedFace: require('../../assets/emoji/relieved-face.png'),
  bullseye: require('../../assets/emoji/bullseye.png'),
  brain: require('../../assets/emoji/brain.png'),
  highVoltage: require('../../assets/emoji/high-voltage.png'),
};

export function Emoji({ name, size = 20, style }) {
  const source = SOURCES[name];
  if (!source) return null;
  return (
    <Image source={source} style={[{ width: size, height: size }, style]} resizeMode="contain" />
  );
}

export default Emoji;
