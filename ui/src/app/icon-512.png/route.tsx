import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 380,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F97316',
          borderRadius: 88,
        }}
      >
        🍳
      </div>
    ),
    { width: 512, height: 512 },
  );
}
