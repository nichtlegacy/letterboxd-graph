import { fetchLetterboxdData, fetchProfileData, imageToBase64 } from "@/lib/web-fetcher"
import { generateGraphs } from "@/lib/web-generator"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  const username = searchParams.get("username")
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()))
  const weekStart = (searchParams.get("weekStart") || "sunday") as "sunday" | "monday"
  const mode = (searchParams.get("mode") || "count") as "count" | "rating"
  const usernameGradient = searchParams.get("gradient") !== "false"

  if (!username) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Username is required" })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      }
    )
  }

  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Step 0: Fetching profile data
        sendEvent({ type: "progress", step: 0, message: "Fetching profile data..." })
        
        const profileData = await fetchProfileData(username)
        
        // Check if profile was found
        if (!profileData.displayName || profileData.displayName === username) {
          // Could be a valid profile with no display name, or invalid - continue anyway
        }

        // Step 1: Loading diary entries
        sendEvent({ type: "progress", step: 1, message: "Loading diary entries..." })
        
        const entries = await fetchLetterboxdData(username, year, (msg) => {
          sendEvent({ type: "progress", step: 1, message: msg })
        })

        if (entries.length === 0) {
          sendEvent({ 
            type: "error", 
            message: `No diary entries found for ${username} in ${year}. Make sure the username is correct and the diary is public.` 
          })
          controller.close()
          return
        }

        // Step 2: Processing data
        sendEvent({ type: "progress", step: 2, message: "Processing film data..." })

        // Fetch profile image and logo
        let profileImageBase64 = null
        if (profileData.profileImage) {
          profileImageBase64 = await imageToBase64(profileData.profileImage)
        }
        
        const logoBase64 = await imageToBase64("https://a.ltrbxd.com/logos/letterboxd-decal-dots-pos-rgb-500px.png")

        // Step 3: Generating graphs
        sendEvent({ type: "progress", step: 3, message: "Generating graphs..." })

        const { darkSvg, lightSvg } = generateGraphs(
          entries,
          { ...profileData, profileImage: profileImageBase64 },
          {
            year,
            weekStart,
            username,
            usernameGradient,
            mode,
            logoBase64
          }
        )

        // Complete
        sendEvent({
          type: "complete",
          darkSvg,
          lightSvg
        })

        controller.close()
      } catch (error) {
        sendEvent({
          type: "error",
          message: error instanceof Error ? error.message : "An unexpected error occurred"
        })
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
