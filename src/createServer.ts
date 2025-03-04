import express, { Application } from 'express';
import provideDocumentation from './provideDocumentation.js';
import handleVideoConversion from './handleVideoConversion.js';

/**
 * Creates and exports the server; export the non-listening express server in order to use
 * SuperTest.
 */
export default (): Application => {
  const app: Application = express();
  app.disable('x-powered-by');

  app.get('/convert', handleVideoConversion);

  // Provide a video for local testing
  app.use('/media', express.static('media'));
  app.use('/styles', express.static('styles'));

  // Provide documentation; fail gracefully as docs are not crucial
  try {
    app.get('', async (_, response): Promise<void> => {
      response.setHeader('Content-Type', 'text/html');
      const docs = await provideDocumentation();
      response.send(docs);
    });
  } catch (error) {
    console.error(error);
  }

  return app;
};
