import { authorizationFor } from '../../../frontend/src/test/authFixtures';
export function useAuth() {
  const role = new URLSearchParams(location.search).get('scenario') === 'finance' ? 'finance_head' : 'super_admin';
  return { user: { id: 'synthetic-actor', role }, authorization: authorizationFor(role, ['projects.design_workflow.payments.read', 'projects.design_workflow.act']) };
}
export function AuthProvider({ children }) { return children; }
