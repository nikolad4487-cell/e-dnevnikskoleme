import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { preserveSelectedStudentPlugin } from './vite/preserveSelectedStudentPlugin';
import { studentPortalExperiencePlugin } from './vite/studentPortalExperiencePlugin';
import { hideFinalThesisFor4KPlugin } from './vite/hideFinalThesisFor4KPlugin';
import { classScopedFinalThesisPlugin } from './vite/classScopedFinalThesisPlugin';
import { finalThesisPersistencePlugin } from './vite/finalThesisPersistencePlugin';
import { finalThesisUiPlugin } from './vite/finalThesisUiPlugin';
import { applicationMetadataPlugin } from './vite/applicationMetadataPlugin';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    plugins: [
      preserveSelectedStudentPlugin(),
      studentPortalExperiencePlugin(),
      hideFinalThesisFor4KPlugin(),
      classScopedFinalThesisPlugin(),
      finalThesisPersistencePlugin(),
      finalThesisUiPlugin(),
      applicationMetadataPlugin(),
      react(),
      tailwindcss(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
