import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/ac-wale-logo.png" alt="AC WALE MARKET" className="h-14 w-14 rounded-xl object-contain border border-zinc-800" />
      <div>
        <h1 className="text-xl font-black">Page not found</h1>
        <p className="mt-1 text-sm text-zinc-400">ይህ ገጽ አልተገኘም። · This page doesn&apos;t exist.</p>
      </div>
      <Link
        href="/"
        className="h-11 px-5 inline-flex items-center rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black"
      >
        Go to the showroom / ወደ ሾውሩም
      </Link>
    </main>
  );
}
