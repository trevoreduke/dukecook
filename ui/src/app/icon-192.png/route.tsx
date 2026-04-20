import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 140,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F97316',
          borderRadius: 32,
        }}
      >
        🍳
      </div>
    ),
    { width: 192, height: 192 },
  );
}
