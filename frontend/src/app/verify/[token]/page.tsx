import { Suspense } from "react";
import VerifyPass from "./VerifyPass";

/**
 * /verify/<token>: public gate-pass check. The client component reads the token from the URL,
 * which Next (Cache Components) requires inside a Suspense boundary.
 */
export default function VerifyPassPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-black" />}>
      <VerifyPass />
    </Suspense>
  );
}
