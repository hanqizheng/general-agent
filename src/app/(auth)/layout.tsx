export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.68),_transparent_30%),linear-gradient(180deg,_#f3efe8_0%,_#ece8e0_100%)] px-4 py-10 text-stone-950">
      <div className="w-full max-w-md rounded-[32px] border border-white/70 bg-[rgba(255,252,247,0.86)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}
