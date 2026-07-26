import { useQuery } from "@tanstack/react-query";
import { AsyncState } from "../../components/ui/AsyncState";
import { OrganizationTree } from "./OrganizationTree";
import { getOrganization, managementKeys } from "../manager/managerApi";

export function HeadDashboard() {
  const query = useQuery({ queryKey: managementKeys.organization, queryFn: getOrganization });
  if (query.isPending) return <AsyncState state="loading" message="Loading organization health…" />;
  if (query.isError) return <AsyncState state="error" message="We couldn't load the organization." actionLabel="Try again" onAction={() => void query.refetch()} />;
  return <section className="designer-page" aria-labelledby="head-title"><header className="workspace-header"><div><p className="eyebrow">Design head</p><h1 id="head-title">Organization delivery health</h1><p>Expand a manager to review team performance and evaluation coverage.</p></div></header><OrganizationTree managers={query.data} /></section>;
}
