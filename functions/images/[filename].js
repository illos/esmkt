/**
 * GET /images/:filename
 * Serves menu item photos stored in Cloudflare R2.
 *
 * Required R2 binding: IMAGES_BUCKET
 */

export async function onRequestGet({ params, env }) {
  const filename = params.filename;

  if (!filename) return new Response('Not found', { status: 404 });

  const obj = await env.IMAGES_BUCKET.get(filename);

  if (!obj) return new Response('Image not found', { status: 404 });

  const contentType = obj.httpMetadata?.contentType || 'image/jpeg';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
