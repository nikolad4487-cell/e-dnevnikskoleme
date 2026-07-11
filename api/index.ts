import { appPromise } from '../server.js';

export default async function handler(req: any, res: any) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (error: any) {
    console.error('[AUTH_LOGIN] Failed:', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    if (res && typeof res.status === 'function') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({
        success: false,
        error: 'Prijava trenutno nije moguća.'
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Prijava trenutno nije moguća.'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
