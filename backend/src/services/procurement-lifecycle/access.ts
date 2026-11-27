import type { ClientSession } from "mongoose";
import type { Role } from "../../domain/roles.js";
import type { PublicUser } from "../auth.service.js";
import { requirePMProject } from "../project-manager/common.js";
import { lcConflict } from "../../domain/procurement-lifecycle.js";
export type LifecycleRow=Record<string,any>;
export async function requireLifecycleProject(actor:PublicUser,projectId:string,session:ClientSession,mutation=false,roles:readonly Role[]=["procurement","finance_head","super_admin"],allowCompleted=false):Promise<LifecycleRow>{
  const project=await requirePMProject(actor,projectId,session,mutation,roles);
  if(mutation&&project.status==="completed"&&!allowCompleted)lcConflict("This project is signed off. Its procurement records are read-only.");
  return project;
}
