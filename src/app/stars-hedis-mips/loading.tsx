// Route-level Suspense boundary for /stars-hedis-mips. Next wraps this segment in
// <Suspense fallback={<Loading/>}>, which satisfies the useSearchParams() static-render
// requirement WITHOUT editing the frozen, over-cap page.tsx (AI-CODING-CONVENTIONS v2 sec 3).
export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen text-carbon-gray-50 text-sm">
      Loading measures…
    </div>
  );
}
