import ResolutionDashboard from "@/components/resolution-dashboard"

export default function ResolutionPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-[#00E5C7]">Entity Resolution Admin</h1>
        <ResolutionDashboard />
      </div>
    </main>
  )
}
