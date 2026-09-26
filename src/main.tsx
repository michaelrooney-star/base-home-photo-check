import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './styles.css';
import { OpsLayout } from './ops/OpsLayout';
import { Queue } from './ops/Queue';
import { CaseDetail } from './ops/CaseDetail';
import { Admin } from './admin/Admin';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/ops/:userId',
    element: <OpsLayout />,
    children: [
      { index: true, element: <Queue /> },
      { path: 'case/:caseId', element: <CaseDetail /> },
    ],
  },
  { path: '/admin', element: <Admin /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
