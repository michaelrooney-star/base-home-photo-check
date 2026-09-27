import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './styles.css';
import { OpsLayout } from './ops/OpsLayout';
import { Queue } from './ops/Queue';
import { CaseDetail } from './ops/CaseDetail';
import { KnowledgeHome } from './admin/knowledge/KnowledgeHome';
import { KnowledgePack } from './admin/knowledge/KnowledgePack';
import { KnowledgeRule } from './admin/knowledge/KnowledgeRule';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/ops/admin',
    element: <OpsLayout />,
    children: [
      { index: true, element: <Queue /> },
      { path: 'case/:caseId', element: <CaseDetail /> },
    ],
  },
  {
    path: '/ops/:userId',
    element: <OpsLayout />,
    children: [
      { index: true, element: <Queue /> },
      { path: 'case/:caseId', element: <CaseDetail /> },
    ],
  },
  { path: '/admin/knowledge', element: <KnowledgeHome /> },
  { path: '/admin/knowledge/packs/:packId', element: <KnowledgePack /> },
  { path: '/admin/knowledge/rules/:ruleId', element: <KnowledgeRule /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
