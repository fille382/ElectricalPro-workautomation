import React from 'react';

interface MapTileBackgroundProps {
  lat: number;
  lon: number;
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export default function MapTileBackground({ lat, lon, zoom = 14, className = '', style, children }: MapTileBackgroundProps) {
  const n = Math.pow(2, zoom);
  const xExact = (lon + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const yExact = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  const x = Math.floor(xExact);
  const y = Math.floor(yExact);

  const xFrac = xExact - x;
  const yFrac = yExact - y;

  // 3x3 grid of 256px tiles = 768x768px total
  // Coordinate is at pixel: ((1 + xFrac) * 256, (1 + yFrac) * 256) in the grid
  const coordX = (1 + xFrac) * 256;
  const coordY = (1 + yFrac) * 256;

  const tileUrl = (tx: number, ty: number) =>
    `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;

  const cols = [x - 1, x, x + 1];
  const rows = [y - 1, y, y + 1];

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      <div
        style={{
          position: 'absolute',
          left: `calc(50% - ${coordX}px)`,
          top: `calc(50% - ${coordY}px)`,
          width: '768px',
          height: '768px',
          display: 'grid',
          gridTemplateColumns: '256px 256px 256px',
          gridTemplateRows: '256px 256px 256px',
        }}
      >
        {rows.map((ty) =>
          cols.map((tx) => (
            <img
              key={`${tx}-${ty}`}
              src={tileUrl(tx, ty)}
              alt=""
              style={{ width: '256px', height: '256px', display: 'block' }}
              loading="lazy"
            />
          ))
        )}
      </div>
      {children}
    </div>
  );
}
