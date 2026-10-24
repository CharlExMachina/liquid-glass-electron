// Plain CSS backdrop-filter: what "glassmorphism" usually is. A blur and more saturation; no bending.
export default async (glass) => {
  for (const el of glass) Object.assign(el.style, { backdropFilter: 'blur(12px) saturate(1.6)', background: 'rgb(255 255 255 / 0.12)', boxShadow: '0 4px 18px rgb(0 0 0 / 0.2)' });
};
