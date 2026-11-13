import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { AppController } from './app/AppController.ts';

registerSW({ immediate: true });

window.addEventListener('DOMContentLoaded', () => {
  try {
    new AppController();
  } catch (err) {
    console.error('AnomaliesApp başlatılamadı:', err);
  }
});
