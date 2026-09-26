import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/@techstark/opencv-js/dist/opencv.js', 'public/vendor/opencv.js');
