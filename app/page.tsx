import { ContributionGraph } from "@/components/contribution-graph"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-50">
      <div className="max-w-4xl w-full space-y-6">
        <h1 className="text-3xl font-bold text-center">Letterboxd Contribution Graph</h1>
        <p className="text-center text-gray-600">
          Visualize your film-watching activity in a GitHub-style contribution graph
        </p>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <ContributionGraph />
        </div>
      </div>
    </main>
  )
}

