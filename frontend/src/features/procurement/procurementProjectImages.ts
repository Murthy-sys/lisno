import livingRoom from "../../assets/procurement-projects/living-room.webp";
import bedroom from "../../assets/procurement-projects/bedroom.webp";
import kitchen from "../../assets/procurement-projects/kitchen.webp";

// Representative interiors only. Covers never identify customer files or business data.
const projectCovers = [livingRoom, bedroom, kitchen] as const;

export function resolveProcurementProjectImage(projectId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = Math.imul(hash ^ projectId.charCodeAt(index), 16777619) >>> 0;
  }
  const coverIndex = ((hash ^ (hash >>> 16)) >>> 0) % projectCovers.length;
  return projectCovers[coverIndex]!;
}
