// Route-level Suspense boundary for /stars-hedis-mips. Next wraps this segment in
// <Suspense fallback={<Loading/>}>, satisfying the useSearchParams() static-render
// requirement WITHOUT editing the frozen, over-cap page.tsx (AI-CODING-CONVENTIONS v2 sec 3).
//
// Authored with createElement (no JSX) on purpose: tsconfig sets jsx:'preserve', which
// vite/esbuild honors under the node-environment unit gate — preserved JSX then fails
// vite import-analysis. No JSX here means the render-free test links it cleanly (E13).
import { createElement } from 'react';

export default function Loading() {
  return createElement(
    'div',
    { className: 'flex items-center justify-center h-screen text-carbon-gray-50 text-sm' },
    'Loading measures…'
  );
}
